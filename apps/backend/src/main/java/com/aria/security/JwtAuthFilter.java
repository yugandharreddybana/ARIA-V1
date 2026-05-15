package com.aria.security;

import com.aria.config.AriaProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Collections;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final PublicKey publicKey;

    public JwtAuthFilter(AriaProperties props) throws Exception {
        // Decode base64 public key and parse as RSA public key
        String keyBase64 = props.jwt().publicKey();
        // Strip PEM headers if present
        String cleaned = keyBase64
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replaceAll("\\s", "");
        // If it looks like it's already base64 of the whole PEM, decode then re-clean
        byte[] decoded = Base64.getDecoder().decode(cleaned);
        // Try to parse as PEM content
        String pemContent = new String(decoded)
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replaceAll("\\s", "");
        byte[] keyBytes = Base64.getDecoder().decode(pemContent);
        X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
        KeyFactory kf = KeyFactory.getInstance("RSA");
        this.publicKey = kf.generatePublic(spec);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            chain.doFilter(request, response);
            return;
        }

        String token = header.substring(7);
        try {
            Claims claims = Jwts.parser()
                .verifyWith(publicKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

            AriaAuthentication auth = new AriaAuthentication(
                claims.getSubject(),
                claims.get("email", String.class),
                claims.get("workspaceId", String.class)
            );
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(auth, null, Collections.emptyList())
            );
        } catch (Exception e) {
            // Invalid token — clear context, let 403 propagate naturally
            SecurityContextHolder.clearContext();
        }

        chain.doFilter(request, response);
    }
}
