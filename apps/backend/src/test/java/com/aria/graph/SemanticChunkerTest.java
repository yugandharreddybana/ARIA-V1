package com.aria.graph;

import com.aria.graph.model.SemanticChunk;
import com.aria.graph.service.SemanticChunker;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SemanticChunkerTest {

    private final SemanticChunker chunker = new SemanticChunker();
    private final UUID pid  = UUID.randomUUID();
    private final UUID wid  = UUID.randomUUID();

    @Test
    void chunks_typescript_into_function_and_class_chunks() {
        String code = """
                export function add(a: number, b: number): number { return a + b; }

                export class Counter {
                  inc() { return 1; }
                }
                """;
        List<SemanticChunk> out = chunker.chunk(pid, wid, "src/util.ts", code);
        assertThat(out).extracting(SemanticChunk::getSymbolName).contains("add", "Counter");
        assertThat(out).allSatisfy(c -> {
            assertThat(c.getSourceLanguage()).isEqualTo("typescript");
            assertThat(c.getVersionHash()).isNotBlank();
        });
    }

    @Test
    void chunks_java_record_and_method() {
        String code = """
                public class Greeter {
                  public String hi(String n) { return "hi " + n; }
                }
                """;
        List<SemanticChunk> out = chunker.chunk(pid, wid, "Greeter.java", code);
        assertThat(out).extracting(SemanticChunk::getSymbolName).contains("Greeter", "hi");
    }

    @Test
    void splits_sql_by_statement_terminator() {
        String sql = """
                CREATE TABLE foo (id UUID);
                INSERT INTO foo VALUES (gen_random_uuid());
                """;
        List<SemanticChunk> out = chunker.chunk(pid, wid, "V100__demo.sql", sql);
        assertThat(out).hasSize(2);
        assertThat(out).extracting(SemanticChunk::getChunkType).containsOnly("sql_statement");
    }

    @Test
    void markdown_chunks_by_heading_and_marks_adr_when_path_matches() {
        String md = """
                # Top

                content

                ## Sub

                more
                """;
        List<SemanticChunk> out = chunker.chunk(pid, wid, ".entiresystem/ADRs/ADR-0009-foo.md", md);
        assertThat(out).isNotEmpty();
        assertThat(out).anySatisfy(c -> assertThat(c.getChunkType()).isEqualTo("adr"));
    }

    @Test
    void unknown_language_falls_back_to_whole_file_module_chunk() {
        List<SemanticChunk> out = chunker.chunk(pid, wid, "weird.xyz", "anything");
        assertThat(out).hasSize(1);
        assertThat(out.get(0).getChunkType()).isEqualTo("module");
    }
}
