package com.aria.graph.model;

/** V27.9 §18N — semantic chunk types emitted by the SemanticChunker. */
public enum ChunkType {
    function,
    klass,           // `class` is a Java reserved keyword
    module,
    schema,
    doc_section,
    config,
    sql_statement,
    adr,
    markdown_block;

    public String wire() { return this == klass ? "class" : name(); }
    public static ChunkType fromWire(String s) {
        if ("class".equals(s)) return klass;
        return ChunkType.valueOf(s);
    }
}
