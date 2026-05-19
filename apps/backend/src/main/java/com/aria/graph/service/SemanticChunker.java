package com.aria.graph.service;

import com.aria.graph.model.ChunkType;
import com.aria.graph.model.SemanticChunk;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * V27.9 §18N SemanticChunker — structure-aware splitter that emits {@link SemanticChunk}s.
 *
 * Implementation note: this Sprint-8 version is regex-based (not tree-sitter) so the daemon
 * has zero native-binding dependencies. Sprint 14 (Phase 9 — benchmarking) is where we can
 * upgrade to tree-sitter once the chaos sandbox image carries the native libs.
 *
 * Supported languages: TypeScript / JavaScript, Java, Python, SQL, Markdown.  Anything else
 * falls back to whole-file `module` chunking so the graph stays complete.
 *
 * Summaries are NOT generated here — they're filled in asynchronously by the
 * ConceptGraphBuilder (which calls the small local Ollama model through the Token Gateway).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SemanticChunker {

    private static final Pattern TS_FUNC   = Pattern.compile(
            "^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*[<(]");
    private static final Pattern TS_ARROW  = Pattern.compile(
            "^\\s*(?:export\\s+)?(?:const|let|var)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*[:=].*=>");
    private static final Pattern TS_CLASS  = Pattern.compile(
            "^\\s*(?:export\\s+(?:default\\s+)?)?(?:abstract\\s+)?class\\s+([A-Za-z_][A-Za-z0-9_]*)\\b");
    private static final Pattern JAVA_METHOD = Pattern.compile(
            "^\\s*(?:public|private|protected|static|final|synchronized|abstract|default|native|\\s)*[\\w<>,\\[\\]\\?\\s]+\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\([^;]*\\)\\s*(?:throws\\s+[\\w,\\s\\.]+)?\\s*\\{");
    private static final Pattern JAVA_CLASS = Pattern.compile(
            "^\\s*(?:public|private|protected|static|final|abstract|\\s)*(?:class|interface|record|enum)\\s+([A-Za-z_][A-Za-z0-9_]*)\\b");
    private static final Pattern PY_DEF    = Pattern.compile("^\\s*(?:async\\s+)?def\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(");
    private static final Pattern PY_CLASS  = Pattern.compile("^\\s*class\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*[:(]");
    private static final Pattern SQL_STMT  = Pattern.compile(
            "^\\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern MD_HEADING = Pattern.compile("^(#{1,6})\\s+(.+)$");

    /** Public entry point — language is detected from the file extension. */
    public List<SemanticChunk> chunk(UUID projectId, UUID workspaceId, String repoRelPath, String content) {
        String language = detectLanguage(repoRelPath);
        String contentHash = sha256(content);
        List<SemanticChunk> out = switch (language) {
            case "typescript", "javascript", "tsx", "jsx" -> chunkTs(repoRelPath, content, language);
            case "java"      -> chunkJava(repoRelPath, content);
            case "python"    -> chunkPython(repoRelPath, content);
            case "sql"       -> chunkSql(repoRelPath, content);
            case "markdown"  -> chunkMarkdown(repoRelPath, content);
            default          -> List.of(wholeFileChunk(repoRelPath, content, language));
        };
        // attach project/workspace/version metadata to every chunk before persistence
        for (SemanticChunk c : out) {
            c.setProjectId(projectId);
            c.setWorkspaceId(workspaceId);
            c.setVersionHash(contentHash);
            if (c.getDependencies() == null) c.setDependencies("[]");
            if (c.getDependents()   == null) c.setDependents("[]");
        }
        return out;
    }

    // ── per-language chunkers ─────────────────────────────────────────────

    private List<SemanticChunk> chunkTs(String file, String content, String language) {
        return chunkByRegex(file, content, language,
                List.of(TS_CLASS, TS_FUNC, TS_ARROW),
                List.of(ChunkType.klass, ChunkType.function, ChunkType.function));
    }

    private List<SemanticChunk> chunkJava(String file, String content) {
        return chunkByRegex(file, content, "java",
                List.of(JAVA_CLASS, JAVA_METHOD),
                List.of(ChunkType.klass, ChunkType.function));
    }

    private List<SemanticChunk> chunkPython(String file, String content) {
        return chunkByRegex(file, content, "python",
                List.of(PY_CLASS, PY_DEF),
                List.of(ChunkType.klass, ChunkType.function));
    }

    private List<SemanticChunk> chunkSql(String file, String content) {
        List<SemanticChunk> out = new ArrayList<>();
        String[] statements = content.split("(?m);\\s*$");
        int line = 1;
        for (String s : statements) {
            String trimmed = s.trim();
            if (trimmed.isEmpty()) continue;
            Matcher m = SQL_STMT.matcher(trimmed);
            String symbol = m.find() ? m.group(0).trim().toUpperCase() : "UNKNOWN";
            int statementLines = (int) s.chars().filter(c -> c == '\n').count() + 1;
            out.add(SemanticChunk.builder()
                    .sourceFile(file)
                    .sourceLanguage("sql")
                    .chunkType(ChunkType.sql_statement.wire())
                    .symbolName(symbol)
                    .lineStart(line)
                    .lineEnd(line + statementLines - 1)
                    .build());
            line += statementLines;
        }
        return out;
    }

    private List<SemanticChunk> chunkMarkdown(String file, String content) {
        List<SemanticChunk> out = new ArrayList<>();
        String[] lines = content.split("\n", -1);
        int sectionStart = 1;
        String sectionTitle = "Preamble";
        StringBuilder buf = new StringBuilder();
        for (int i = 0; i < lines.length; i++) {
            Matcher m = MD_HEADING.matcher(lines[i]);
            if (m.find()) {
                if (buf.length() > 0 || i > 0) {
                    out.add(SemanticChunk.builder()
                            .sourceFile(file)
                            .sourceLanguage("markdown")
                            .chunkType(file.endsWith(".md") && file.contains("/ADRs/") ? ChunkType.adr.wire() : ChunkType.doc_section.wire())
                            .symbolName(sectionTitle)
                            .lineStart(sectionStart)
                            .lineEnd(i)
                            .build());
                }
                sectionStart = i + 1;
                sectionTitle = m.group(2).trim();
                buf.setLength(0);
            } else {
                buf.append(lines[i]).append('\n');
            }
        }
        if (buf.length() > 0) {
            out.add(SemanticChunk.builder()
                    .sourceFile(file)
                    .sourceLanguage("markdown")
                    .chunkType(file.contains("/ADRs/") ? ChunkType.adr.wire() : ChunkType.doc_section.wire())
                    .symbolName(sectionTitle)
                    .lineStart(sectionStart)
                    .lineEnd(lines.length)
                    .build());
        }
        return out;
    }

    private List<SemanticChunk> chunkByRegex(String file, String content, String language,
                                             List<Pattern> patterns, List<ChunkType> types) {
        List<SemanticChunk> out = new ArrayList<>();
        String[] lines = content.split("\n", -1);
        int currentStart = -1;
        String currentSymbol = null;
        ChunkType currentType = null;

        for (int i = 0; i < lines.length; i++) {
            for (int p = 0; p < patterns.size(); p++) {
                Matcher m = patterns.get(p).matcher(lines[i]);
                if (m.find()) {
                    if (currentStart >= 0 && currentSymbol != null) {
                        out.add(SemanticChunk.builder()
                                .sourceFile(file).sourceLanguage(language)
                                .chunkType(currentType.wire()).symbolName(currentSymbol)
                                .lineStart(currentStart + 1).lineEnd(i)
                                .build());
                    }
                    currentStart = i;
                    currentSymbol = m.group(1);
                    currentType   = types.get(p);
                    break;
                }
            }
        }
        if (currentStart >= 0 && currentSymbol != null) {
            out.add(SemanticChunk.builder()
                    .sourceFile(file).sourceLanguage(language)
                    .chunkType(currentType.wire()).symbolName(currentSymbol)
                    .lineStart(currentStart + 1).lineEnd(lines.length)
                    .build());
        }
        if (out.isEmpty()) out.add(wholeFileChunk(file, content, language));
        return out;
    }

    private SemanticChunk wholeFileChunk(String file, String content, String language) {
        int lines = (int) content.chars().filter(c -> c == '\n').count() + 1;
        return SemanticChunk.builder()
                .sourceFile(file)
                .sourceLanguage(language)
                .chunkType(ChunkType.module.wire())
                .symbolName(file)
                .lineStart(1)
                .lineEnd(lines)
                .build();
    }

    static String detectLanguage(String path) {
        if (path.endsWith(".ts"))   return "typescript";
        if (path.endsWith(".tsx"))  return "tsx";
        if (path.endsWith(".js"))   return "javascript";
        if (path.endsWith(".jsx"))  return "jsx";
        if (path.endsWith(".java")) return "java";
        if (path.endsWith(".py"))   return "python";
        if (path.endsWith(".sql"))  return "sql";
        if (path.endsWith(".md") || path.endsWith(".markdown")) return "markdown";
        if (path.endsWith(".yml") || path.endsWith(".yaml") || path.endsWith(".json")) return "config";
        return "text";
    }

    static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes()));
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }
}
