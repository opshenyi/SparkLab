package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func JWTAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, ok := tokenFromCookieOrHeader(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
			return
		}

		claims, err := ParseToken(token, secret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
			return
		}

		c.Set("userId", claims.Subject)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

func OptionalJWTAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, ok := tokenFromCookieOrHeader(c)
		if !ok {
			c.Next()
			return
		}

		claims, err := ParseToken(token, secret)
		if err == nil {
			c.Set("userId", claims.Subject)
			c.Set("username", claims.Username)
			c.Set("role", claims.Role)
		}
		c.Next()
	}
}

func tokenFromCookieOrHeader(c *gin.Context) (string, bool) {
	if v, err := c.Cookie("access_token"); err == nil && strings.TrimSpace(v) != "" {
		return v, true
	}

	h := c.GetHeader("Authorization")
	if strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return strings.TrimSpace(h[7:]), true
	}
	return "", false
}
