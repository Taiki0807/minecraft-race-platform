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

	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/raceevent"
)

const (
	raceEventConfigMapName = "race-controller-events"
	raceEventDataKey       = "events.json"
)

var ErrRaceEventsNotFound = errors.New("stored race events not found")

type RaceEventStore struct {
	client    kubernetes.Interface
	namespace string
}

func NewRaceEventStore(
	client kubernetes.Interface,
	namespace string,
) *RaceEventStore {
	return &RaceEventStore{
		client:    client,
		namespace: namespace,
	}
}

func (s *RaceEventStore) Save(
	ctx context.Context,
	events []raceevent.Event,
) error {
	encodedEvents, err := json.Marshal(events)
	if err != nil {
		return fmt.Errorf("encode race events: %w", err)
	}

	configMaps := s.client.CoreV1().
		ConfigMaps(s.namespace)

	existingConfigMap, err := configMaps.Get(
		ctx,
		raceEventConfigMapName,
		metav1.GetOptions{},
	)

	if apierrors.IsNotFound(err) {
		configMap := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name: raceEventConfigMapName,
				Labels: map[string]string{
					"app.kubernetes.io/name":       "race-controller",
					"app.kubernetes.io/managed-by": "race-controller",
				},
			},
			Data: map[string]string{
				raceEventDataKey: string(encodedEvents),
			},
		}

		_, err = configMaps.Create(
			ctx,
			configMap,
			metav1.CreateOptions{},
		)

		if err != nil {
			return fmt.Errorf(
				"create race event ConfigMap: %w",
				err,
			)
		}

		return nil
	}

	if err != nil {
		return fmt.Errorf(
			"get race event ConfigMap: %w",
			err,
		)
	}

	if existingConfigMap.Data == nil {
		existingConfigMap.Data = make(map[string]string)
	}

	existingConfigMap.Data[raceEventDataKey] =
		string(encodedEvents)

	_, err = configMaps.Update(
		ctx,
		existingConfigMap,
		metav1.UpdateOptions{},
	)

	if err != nil {
		return fmt.Errorf(
			"update race event ConfigMap: %w",
			err,
		)
	}

	return nil
}

func (s *RaceEventStore) Load(
	ctx context.Context,
) ([]raceevent.Event, error) {
	configMap, err := s.client.CoreV1().
		ConfigMaps(s.namespace).
		Get(
			ctx,
			raceEventConfigMapName,
			metav1.GetOptions{},
		)

	if apierrors.IsNotFound(err) {
		return nil, ErrRaceEventsNotFound
	}

	if err != nil {
		return nil, fmt.Errorf(
			"get race event ConfigMap: %w",
			err,
		)
	}

	encodedEvents, exists :=
		configMap.Data[raceEventDataKey]

	if !exists || encodedEvents == "" {
		return nil, ErrRaceEventsNotFound
	}

	var events []raceevent.Event

	if err := json.Unmarshal(
		[]byte(encodedEvents),
		&events,
	); err != nil {
		return nil, fmt.Errorf(
			"decode race events: %w",
			err,
		)
	}

	return events, nil
}

func (s *RaceEventStore) Delete(
	ctx context.Context,
) error {
	err := s.client.CoreV1().
		ConfigMaps(s.namespace).
		Delete(
			ctx,
			raceEventConfigMapName,
			metav1.DeleteOptions{},
		)

	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf(
			"delete race event ConfigMap: %w",
			err,
		)
	}

	return nil
}
