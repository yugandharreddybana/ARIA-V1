package com.aria;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class AriaBackendApplication {
    public static void main(String[] args) {
        SpringApplication.run(AriaBackendApplication.class, args);
    }
}
