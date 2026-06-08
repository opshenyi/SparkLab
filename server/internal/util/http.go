package util

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func Error(c *gin.Context, code int, msg string) {
	c.JSON(code, gin.H{"message": msg})
}

func Unauthorized(c *gin.Context, msg string) {
	if msg == "" {
		msg = "Unauthorized"
	}
	Error(c, http.StatusUnauthorized, msg)
}

func BadRequest(c *gin.Context, msg string) {
	if msg == "" {
		msg = "Bad request"
	}
	Error(c, http.StatusBadRequest, msg)
}
