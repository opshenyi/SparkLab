package handler

import "testing"

func TestSameStringSetRequiresExactMultiplicity(t *testing.T) {
	if !sameStringSet([]string{"A", "B"}, []string{"B", "A"}) {
		t.Fatal("expected same options in different order to match")
	}
	if sameStringSet([]string{"A", "A"}, []string{"A", "B"}) {
		t.Fatal("expected duplicated student option to be rejected")
	}
	if sameStringSet([]string{"A"}, []string{"A", "B"}) {
		t.Fatal("expected missing option to be rejected")
	}
}
