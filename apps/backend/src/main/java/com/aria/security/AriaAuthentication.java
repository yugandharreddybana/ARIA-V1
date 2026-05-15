package com.aria.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;

import java.util.Collection;
import java.util.List;

/**
 * Custom Authentication object used in Spring Security context.
 * Populated by JwtAuthenticationFilter from the verified JWT payload.
 */
public record AriaAuthentication(
        String userId,
        String email,
        String name,
        String workspaceId,
        String jti
) implements Authentication {

    @Override public String getName() { return email; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() { return List.of(); }
    @Override public Object getCredentials() { return null; }
    @Override public Object getDetails() { return null; }
    @Override public Object getPrincipal() { return userId; }
    @Override public boolean isAuthenticated() { return true; }
    @Override public void setAuthenticated(boolean isAuthenticated) {}
}
