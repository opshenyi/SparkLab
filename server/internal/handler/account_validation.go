package handler

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	usernameMinLen    = 3
	usernameMaxLen    = 32
	displayNameMinLen = 2
	displayNameMaxLen = 40
	passwordMinLen    = 6
	passwordMaxBytes  = 72
	qqNumberMinLen    = 5
	qqNumberMaxLen    = 15
)

func normalizeUsername(raw string) (string, string) {
	value := strings.TrimSpace(raw)
	if len(value) < usernameMinLen || len(value) > usernameMaxLen {
		return "", "用户名长度需为 3-32 个字符"
	}
	for i, r := range value {
		if isASCIILetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' {
			if i == 0 && r == '-' {
				return "", "用户名必须以字母、数字或下划线开头"
			}
			continue
		}
		return "", "用户名只能包含字母、数字、下划线或短横线"
	}
	return value, ""
}

func normalizeDisplayName(raw string) (string, string) {
	value := strings.TrimSpace(raw)
	n := utf8.RuneCountInString(value)
	if n < displayNameMinLen || n > displayNameMaxLen {
		return "", "显示姓名长度需为 2-40 个字符"
	}
	for _, r := range value {
		if unicode.IsControl(r) || r == '<' || r == '>' {
			return "", "显示姓名包含不支持的字符"
		}
	}
	return value, ""
}

func validatePassword(raw string) string {
	if utf8.RuneCountInString(raw) < passwordMinLen {
		return "密码至少需要 6 个字符"
	}
	if len(raw) > passwordMaxBytes {
		return "密码最多支持 72 字节"
	}
	return ""
}

func normalizeOptionalQQ(raw *string) (*string, string) {
	if raw == nil {
		return nil, ""
	}
	value := strings.TrimSpace(*raw)
	if value == "" {
		return nil, ""
	}
	if len(value) < qqNumberMinLen || len(value) > qqNumberMaxLen {
		return nil, "QQ 号长度需为 5-15 位数字"
	}
	for _, r := range value {
		if !unicode.IsDigit(r) {
			return nil, "QQ 号只能包含数字"
		}
	}
	return &value, ""
}

func isASCIILetter(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
}
