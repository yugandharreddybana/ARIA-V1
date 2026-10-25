package com.aria.security;

import com.aria.exception.AriaException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ProjectAccess {

    private final JdbcTemplate jdbc;

    public static AriaAuthentication require(AriaAuthentication auth) {
        if (auth == null || auth.workspaceId() == null || auth.workspaceId().isBlank()) {
            throw AriaException.unauthorized("Authentication required");
        }
        return auth;
    }

    public void assertProject(String projectId, String workspaceId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM projects WHERE id = ?::uuid AND workspace_id = ?::uuid",
                Integer.class, projectId, workspaceId);
        if (count == null || count == 0) throw AriaException.notFound("Project not found");
    }

    public void assertRepo(String repoId, String projectId) {
        if (repoId == null || repoId.isBlank()) return;
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM project_repos WHERE id = ?::uuid AND project_id = ?::uuid",
                Integer.class, repoId, projectId);
        if (count == null || count == 0) throw AriaException.notFound("Repository not found");
    }

    public void stampText(String table, String idColumn, String id, String workspaceId) {
        jdbc.update("UPDATE " + table + " SET workspace_id = ?::uuid WHERE " + idColumn + " = ?", workspaceId, id);
    }

    public void stampUuid(String table, String id, String workspaceId) {
        jdbc.update("UPDATE " + table + " SET workspace_id = ?::uuid WHERE id = ?::uuid", workspaceId, id);
    }

    public boolean owns(String table, String id, String workspaceId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE id = ?::uuid AND workspace_id = ?::uuid",
                Integer.class, id, workspaceId);
        return count != null && count > 0;
    }
}
