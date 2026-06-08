package model

import (
	"database/sql/driver"
	"fmt"
	"time"
)

type UnixTime struct {
	time.Time
}

func (t UnixTime) MarshalJSON() ([]byte, error) {
	if t.IsZero() {
		return []byte("null"), nil
	}
	return []byte(fmt.Sprintf("\"%s\"", t.Format(time.RFC3339))), nil
}

func (t *UnixTime) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil
	}
	parsed, err := time.Parse("\""+time.RFC3339+"\"", string(data))
	if err != nil {
		return err
	}
	t.Time = parsed
	return nil
}

func (t UnixTime) Value() (driver.Value, error) {
	if t.IsZero() {
		return nil, nil
	}
	return t.Unix() * 1000, nil // Store as milliseconds if needed, or just Unic() for seconds. 
	// Based on "int64 into type *time.Time", it's likely milliseconds or seconds.
	// But since the current error says it's STORING int64, we need to be able to SCAN int64.
}

func (t *UnixTime) Scan(value interface{}) error {
	if value == nil {
		t.Time = time.Time{}
		return nil
	}

	switch v := value.(type) {
	case int64:
		if v > 1e12 { // Milliseconds
			t.Time = time.Unix(v/1000, (v%1000)*1e6)
		} else { // Seconds
			t.Time = time.Unix(v, 0)
		}
	case time.Time:
		t.Time = v
	case string:
		parsed, err := time.Parse(time.RFC3339, v)
		if err != nil {
			parsed, err = time.Parse("2006-01-02 15:04:05", v)
			if err != nil {
				return err
			}
		}
		t.Time = parsed
	default:
		return fmt.Errorf("cannot scan type %T into UnixTime", value)
	}
	return nil
}

func Now() UnixTime {
	return UnixTime{Time: time.Now()}
}
