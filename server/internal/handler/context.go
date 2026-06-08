package handler

import "github.com/gin-gonic/gin"

func userIDFromCtx(c *gin.Context) (string, bool) {
	v, ok := c.Get("userId")
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

func userRoleFromCtx(c *gin.Context) string {
	v, ok := c.Get("role")
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}
