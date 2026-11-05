package push

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

var (
	subIDPattern    = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
	errInvalidSubID = errors.New("invalid subscription ID format")
)

type Storage struct {
	rootDir string
	mu      sync.RWMutex
}

func NewStorage(rootDir string) (*Storage, error) {
	subDir := filepath.Join(rootDir, "subscriptions")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create storage directory %s: %w", subDir, err)
	}
	return &Storage{rootDir: rootDir}, nil
}

func (s *Storage) IsSafeSubID(subID string) bool {
	return subIDPattern.MatchString(subID)
}

func (s *Storage) filePath(subID string) (string, error) {
	if !s.IsSafeSubID(subID) {
		return "", errInvalidSubID
	}
	return filepath.Join(s.rootDir, "subscriptions", subID+".json"), nil
}

// Save atomically writes the subscription record to disk.
func (s *Storage) Save(record *SubscriptionRecord) error {
	path, err := s.filePath(record.SubID)
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to encode record: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write tmp file: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to rename record file: %w", err)
	}

	return nil
}

// Get reads a single subscription record.
func (s *Storage) Get(subID string) (*SubscriptionRecord, error) {
	path, err := s.filePath(subID)
	if err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var record SubscriptionRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, fmt.Errorf("failed to decode record: %w", err)
	}

	return &record, nil
}

// Delete removes the subscription record from disk.
func (s *Storage) Delete(subID string) error {
	path, err := s.filePath(subID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// ListAll returns all stored subscription records.
func (s *Storage) ListAll() ([]*SubscriptionRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	subDir := filepath.Join(s.rootDir, "subscriptions")
	entries, err := os.ReadDir(subDir)
	if err != nil {
		return nil, err
	}

	var records []*SubscriptionRecord
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") || strings.HasSuffix(entry.Name(), ".tmp") {
			continue
		}
		path := filepath.Join(subDir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var record SubscriptionRecord
		if err := json.Unmarshal(data, &record); err == nil {
			records = append(records, &record)
		}
	}

	return records, nil
}
