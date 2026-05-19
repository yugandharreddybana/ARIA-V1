package com.aria.graph.model;

/** V27.9 §18N — Concept Graph levels. */
public enum GraphLevel {
    SYMBOL(1), MODULE(2), DOMAIN(3), DECISION(4);

    private final int level;
    GraphLevel(int level) { this.level = level; }
    public int level() { return level; }

    public static GraphLevel fromInt(int v) {
        for (GraphLevel g : values()) if (g.level == v) return g;
        throw new IllegalArgumentException("Unknown graph level: " + v);
    }
}
