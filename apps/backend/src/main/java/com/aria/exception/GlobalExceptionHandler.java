package com.aria.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(AriaException.class)
    public ResponseEntity<Map<String, Object>> handleAriaException(AriaException ex) {
        return ResponseEntity
            .status(ex.getStatusCode())
            .body(Map.of(
                "success", false,
                "error", ex.getMessage(),
                "code", ex.getCode()
            ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        List<Map<String, String>> details = ex.getBindingResult().getAllErrors().stream()
            .map(error -> {
                Map<String, String> fieldError = new HashMap<>();
                if (error instanceof FieldError fe) {
                    fieldError.put("field", fe.getField());
                    fieldError.put("message", fe.getDefaultMessage());
                } else {
                    fieldError.put("field", error.getObjectName());
                    fieldError.put("message", error.getDefaultMessage());
                }
                return fieldError;
            }).toList();

        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(Map.of(
                "success", false,
                "error", "Validation failed",
                "code", "VALIDATION_ERROR",
                "details", details
            ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        // Never leak internals
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(Map.of(
                "success", false,
                "error", "An unexpected error occurred",
                "code", "INTERNAL_ERROR"
            ));
    }
}
