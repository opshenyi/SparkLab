package handler

import (
	"crypto/rand"
	"encoding/hex"
	"strings"

	"github.com/gin-gonic/gin"
)

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func authTokenFromRequest(c *gin.Context) (string, bool) {
	if v, err := c.Cookie("access_token"); err == nil && strings.TrimSpace(v) != "" {
		return v, true
	}
	h := c.GetHeader("Authorization")
	if len(h) > 7 && strings.ToLower(h[:7]) == "bearer " {
		return strings.TrimSpace(h[7:]), true
	}
	return "", false
}
