package kube

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/match"
)

const (
	matchStateConfigMapName = "race-controller-state"
	matchStateDataKey       = "current-match.json"
)

var ErrMatchStateNotFound = errors.New("stored match state not found")

type MatchStore struct {
	client    kubernetes.Interface
	namespace string
}

func NewMatchStore(
	client kubernetes.Interface,
	namespace string,
) *MatchStore {
	return &MatchStore{
		client:    client,
		namespace: namespace,
	}
}

func (s *MatchStore) Save(
	ctx context.Context,
	raceMatch *match.Match,
) error {
	encodedMatch, err := json.Marshal(raceMatch)
	if err != nil {
		return fmt.Errorf("encode match state: %w", err)
	}

	configMaps := s.client.CoreV1().ConfigMaps(s.namespace)

	existingConfigMap, err := configMaps.Get(
		ctx,
		matchStateConfigMapName,
		metav1.GetOptions{},
	)

	if apierrors.IsNotFound(err) {
		configMap := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name: matchStateConfigMapName,
				Labels: map[string]string{
					"app.kubernetes.io/name":       "race-controller",
					"app.kubernetes.io/managed-by": "race-controller",
				},
			},
			Data: map[string]string{
				matchStateDataKey: string(encodedMatch),
			},
		}

		_, err = configMaps.Create(
			ctx,
			configMap,
			metav1.CreateOptions{},
		)

		if err != nil {
			return fmt.Errorf("create match state ConfigMap: %w", err)
		}

		return nil
	}

	if err != nil {
		return fmt.Errorf("get match state ConfigMap: %w", err)
	}

	if existingConfigMap.Data == nil {
		existingConfigMap.Data = make(map[string]string)
	}

	existingConfigMap.Data[matchStateDataKey] = string(encodedMatch)

	_, err = configMaps.Update(
		ctx,
		existingConfigMap,
		metav1.UpdateOptions{},
	)

	if err != nil {
		return fmt.Errorf("update match state ConfigMap: %w", err)
	}

	return nil
}

func (s *MatchStore) Load(
	ctx context.Context,
) (*match.Match, error) {
	configMap, err := s.client.CoreV1().
		ConfigMaps(s.namespace).
		Get(
			ctx,
			matchStateConfigMapName,
			metav1.GetOptions{},
		)

	if apierrors.IsNotFound(err) {
		return nil, ErrMatchStateNotFound
	}

	if err != nil {
		return nil, fmt.Errorf("get match state ConfigMap: %w", err)
	}

	encodedMatch, exists := configMap.Data[matchStateDataKey]
	if !exists || encodedMatch == "" {
		return nil, ErrMatchStateNotFound
	}

	var storedMatch match.Match

	if err := json.Unmarshal(
		[]byte(encodedMatch),
		&storedMatch,
	); err != nil {
		return nil, fmt.Errorf("decode match state: %w", err)
	}

	return &storedMatch, nil
}

func (s *MatchStore) Delete(
	ctx context.Context,
) error {
	err := s.client.CoreV1().
		ConfigMaps(s.namespace).
		Delete(
			ctx,
			matchStateConfigMapName,
			metav1.DeleteOptions{},
		)

	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("delete match state ConfigMap: %w", err)
	}

	return nil
}
