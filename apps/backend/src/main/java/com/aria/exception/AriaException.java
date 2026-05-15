package com.aria.exception;

import org.springframework.http.HttpStatus;

public class AriaException extends RuntimeException {

    private final HttpStatus statusCode;
    private final String code;

    public AriaException(String message, HttpStatus statusCode, String code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }

    public static AriaException notFound(String message) {
        return new AriaException(message, HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    public static AriaException badRequest(String message, String code) {
        return new AriaException(message, HttpStatus.BAD_REQUEST, code);
    }

    public static AriaException forbidden(String message) {
        return new AriaException(message, HttpStatus.FORBIDDEN, "FORBIDDEN");
    }

    public static AriaException conflict(String message, String code) {
        return new AriaException(message, HttpStatus.CONFLICT, code);
    }

    public HttpStatus getStatusCode() { return statusCode; }
    public String getCode() { return code; }
}
