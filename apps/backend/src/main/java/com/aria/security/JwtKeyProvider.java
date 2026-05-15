package com.aria.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

@Slf4j
@Component
public class JwtKeyProvider {

    @Value("${aria.jwt.public-key}")
    private String publicKeyPem;

    private volatile PublicKey cachedKey;

    public PublicKey getPublicKey() throws Exception {
        if (cachedKey != null) return cachedKey;
        synchronized (this) {
            if (cachedKey != null) return cachedKey;
            String clean = publicKeyPem
                    .replace("-----BEGIN PUBLIC KEY-----", "")
                    .replace("-----END PUBLIC KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] decoded = Base64.getDecoder().decode(clean);
            cachedKey = KeyFactory.getInstance("RSA")
                    .generatePublic(new X509EncodedKeySpec(decoded));
            return cachedKey;
        }
    }
}
