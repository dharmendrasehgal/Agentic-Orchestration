// Package middleware provides shared Gin middleware for DCMS services.
package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

const (
	// RequestIDHeader is the HTTP response header that carries the generated request ID.
	RequestIDHeader = "X-Request-ID"

	// requestIDContextKey is the Gin context key for the request ID string.
	requestIDContextKey = "request_id"
)

// skipPaths defines endpoints that are excluded from access logging.
var skipPaths = map[string]struct{}{
	"/health":  {},
	"/healthz": {},
	"/readyz":  {},
	"/metrics": {},
}

// StructuredLogger returns a Gin middleware that writes a structured JSON log
// entry for every request using the supplied *zap.Logger.
//
// Each log entry includes:
//   - method, path, status, latency_ms, client_ip
//   - request_id (UUID v4 injected per request; also set on X-Request-ID response header)
//   - user_id (extracted from JWT claims when the Authenticate middleware has run)
//   - trace_id (extracted from the active OpenTelemetry span when present)
//
// Requests to /health, /healthz, /readyz and /metrics are silently skipped.
func StructuredLogger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		// Skip logging for health/metrics endpoints.
		if _, skip := skipPaths[path]; skip {
			c.Next()
			return
		}

		// Generate and inject request ID.
		requestID := uuid.New().String()
		c.Set(requestIDContextKey, requestID)
		c.Header(RequestIDHeader, requestID)

		start := time.Now()
		c.Next()
		latency := time.Since(start)

		// Collect fields after the handler chain executes.
		fields := []zap.Field{
			zap.String("request_id", requestID),
			zap.String("method", c.Request.Method),
			zap.String("path", path),
			zap.String("query", c.Request.URL.RawQuery),
			zap.Int("status", c.Writer.Status()),
			zap.Int64("latency_ms", latency.Milliseconds()),
			zap.String("client_ip", c.ClientIP()),
			zap.Int("response_size", c.Writer.Size()),
		}

		// Include user_id when Authenticate middleware has already run.
		if claims, ok := ClaimsFromContext(c); ok {
			fields = append(fields, zap.String("user_id", claims.UserID))
			fields = append(fields, zap.String("org_id", claims.OrgID))
		}

		// Include OpenTelemetry trace_id when a span is active.
		if spanCtx := trace.SpanFromContext(c.Request.Context()).SpanContext(); spanCtx.IsValid() {
			fields = append(fields,
				zap.String("trace_id", spanCtx.TraceID().String()),
				zap.String("span_id", spanCtx.SpanID().String()),
			)
		}

		// Include any errors attached by handlers.
		if len(c.Errors) > 0 {
			fields = append(fields, zap.String("errors", c.Errors.ByType(gin.ErrorTypePrivate).String()))
		}

		switch {
		case c.Writer.Status() >= 500:
			logger.Error("request completed", fields...)
		case c.Writer.Status() >= 400:
			logger.Warn("request completed", fields...)
		default:
			logger.Info("request completed", fields...)
		}
	}
}

// RequestIDFromContext returns the request ID injected by StructuredLogger.
// Returns an empty string when the middleware has not run.
func RequestIDFromContext(c *gin.Context) string {
	v, _ := c.Get(requestIDContextKey)
	id, _ := v.(string)
	return id
}
