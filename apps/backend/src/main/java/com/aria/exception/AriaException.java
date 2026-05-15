package com.aria.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class AriaException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public AriaException(String message, HttpStatus status, String code) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static AriaException notFound(String message) {
        return new AriaException(message, HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    public static AriaException badRequest(String message) {
        return new AriaException(message, HttpStatus.BAD_REQUEST, "BAD_REQUEST");
    }

    public static AriaException unauthorized(String message) {
        return new AriaException(message, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
}
