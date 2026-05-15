package com.aria.security;

public record AriaAuthentication(
    String userId,
    String email,
    String workspaceId
) {}
