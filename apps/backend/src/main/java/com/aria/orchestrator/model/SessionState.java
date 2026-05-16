package com.aria.orchestrator.model;

/** Session lifecycle state machine (V27.9 §4). */
public enum SessionState {
    new_, bootstrapping, scrumming, working, paused, completed, failed;

    /** Lowercase wire name (`new` is a reserved Java keyword, so we suffix with _ in the enum constant). */
    public String wire() {
        return this == new_ ? "new" : name();
    }

    public static SessionState fromWire(String s) {
        if (s == null || s.isEmpty()) return new_;
        if ("new".equals(s)) return new_;
        return SessionState.valueOf(s);
    }
}
