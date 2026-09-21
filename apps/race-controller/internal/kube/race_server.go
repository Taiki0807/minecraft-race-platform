package kube

import (
	"context"
	"fmt"
	"log"
	"net"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/kubernetes"

	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/match"
)

const (
	minecraftImage   = "itzg/minecraft-server:latest"
	minecraftVersion = "1.21.9"
)

type RaceServerRepository struct {
	client    kubernetes.Interface
	namespace string
}

func NewRaceServerRepository(
	client kubernetes.Interface,
	namespace string,
) *RaceServerRepository {
	return &RaceServerRepository{
		client:    client,
		namespace: namespace,
	}
}

func (r *RaceServerRepository) Create(
	ctx context.Context,
	raceMatch *match.Match,
) error {
	for _, player := range raceMatch.Players {
		if err := r.createPlayerServer(ctx, raceMatch, player); err != nil {
			_ = r.Delete(ctx, raceMatch)

			return fmt.Errorf(
				"create server for player %d: %w",
				player.Slot,
				err,
			)
		}
	}

	return nil
}

func (r *RaceServerRepository) createPlayerServer(
	ctx context.Context,
	raceMatch *match.Match,
	player match.Player,
) error {
	name := resourceName(raceMatch.ID, player.Slot)
	labels := resourceLabels(raceMatch.ID, player.Slot)

	if err := r.createPVC(ctx, name, labels); err != nil {
		return err
	}

	if err := r.createService(ctx, name, labels, player.Address); err != nil {
		return err
	}

	if err := r.createDeployment(
		ctx,
		name,
		labels,
		raceMatch.Seed,
	); err != nil {
		return err
	}

	return nil
}

func (r *RaceServerRepository) createPVC(
	ctx context.Context,
	name string,
	labels map[string]string,
) error {
	storageClassName := "local-path"
	volumeMode := corev1.PersistentVolumeFilesystem

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:   name,
			Labels: labels,
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{
				corev1.ReadWriteOnce,
			},
			StorageClassName: &storageClassName,
			VolumeMode:       &volumeMode,
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("10Gi"),
				},
			},
		},
	}

	_, err := r.client.CoreV1().
		PersistentVolumeClaims(r.namespace).
		Create(ctx, pvc, metav1.CreateOptions{})

	if err != nil {
		return fmt.Errorf("create PVC %s: %w", name, err)
	}

	return nil
}

func (r *RaceServerRepository) createService(
	ctx context.Context,
	name string,
	labels map[string]string,
	address string,
) error {
	hostname, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("parse player address %q: %w", address, err)
	}

	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:   name,
			Labels: labels,
			Annotations: map[string]string{
				"mc-router.itzg.me/externalServerName": hostname,
			},
		},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceTypeClusterIP,
			Selector: labels,
			Ports: []corev1.ServicePort{
				{
					Name:       "minecraft",
					Port:       25565,
					TargetPort: intstr.FromString("minecraft"),
					Protocol:   corev1.ProtocolTCP,
				},
			},
		},
	}

	_, err = r.client.CoreV1().
		Services(r.namespace).
		Create(ctx, service, metav1.CreateOptions{})

	if err != nil {
		return fmt.Errorf("create Service %s: %w", name, err)
	}

	return nil
}

func (r *RaceServerRepository) createDeployment(
	ctx context.Context,
	name string,
	labels map[string]string,
	seed int64,
) error {
	replicas := int32(1)

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:   name,
			Labels: labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Strategy: appsv1.DeploymentStrategy{
				Type: appsv1.RecreateDeploymentStrategyType,
			},
			Selector: &metav1.LabelSelector{
				MatchLabels: labels,
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
				},
				Spec: corev1.PodSpec{
					NodeSelector: map[string]string{
						"workload": "minecraft-race",
					},
					Containers: []corev1.Container{
						{
							Name:  "minecraft",
							Image: minecraftImage,
							Ports: []corev1.ContainerPort{
								{
									Name:          "minecraft",
									ContainerPort: 25565,
								},
							},
							Env: minecraftEnvironment(seed),
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("250m"),
									corev1.ResourceMemory: resource.MustParse("1280Mi"),
								},
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("2"),
									corev1.ResourceMemory: resource.MustParse("1536Mi"),
								},
							},
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									Exec: &corev1.ExecAction{
										Command: []string{"mc-health"},
									},
								},
								InitialDelaySeconds: 30,
								PeriodSeconds:       5,
								FailureThreshold:    20,
							},
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "data",
									MountPath: "/data",
								},
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "data",
							VolumeSource: corev1.VolumeSource{
								PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
									ClaimName: name,
								},
							},
						},
					},
				},
			},
		},
	}

	_, err := r.client.AppsV1().
		Deployments(r.namespace).
		Create(ctx, deployment, metav1.CreateOptions{})

	if err != nil {
		return fmt.Errorf("create Deployment %s: %w", name, err)
	}

	return nil
}

func minecraftEnvironment(seed int64) []corev1.EnvVar {
	return []corev1.EnvVar{
		{Name: "EULA", Value: "TRUE"},
		{Name: "TYPE", Value: "PAPER"},
		{Name: "VERSION", Value: minecraftVersion},
		{Name: "MEMORY", Value: "1024M"},
		{Name: "MAX_PLAYERS", Value: "1"},
		{Name: "MODE", Value: "survival"},
		{Name: "DIFFICULTY", Value: "normal"},
		{Name: "VIEW_DISTANCE", Value: "6"},
		{Name: "SIMULATION_DISTANCE", Value: "4"},
		{Name: "SEED", Value: fmt.Sprintf("%d", seed)},
	}
}

func (r *RaceServerRepository) Delete(
	ctx context.Context,
	raceMatch *match.Match,
) error {
	for _, player := range raceMatch.Players {
		name := resourceName(raceMatch.ID, player.Slot)

		if err := r.deleteDeployment(ctx, name); err != nil {
			return err
		}

		if err := r.deleteService(ctx, name); err != nil {
			return err
		}

		if err := r.deletePVC(ctx, name); err != nil {
			return err
		}
	}

	return nil
}

func (r *RaceServerRepository) deleteDeployment(
	ctx context.Context,
	name string,
) error {
	err := r.client.AppsV1().
		Deployments(r.namespace).
		Delete(ctx, name, metav1.DeleteOptions{})

	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("delete Deployment %s: %w", name, err)
	}

	return nil
}

func (r *RaceServerRepository) deleteService(
	ctx context.Context,
	name string,
) error {
	err := r.client.CoreV1().
		Services(r.namespace).
		Delete(ctx, name, metav1.DeleteOptions{})

	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("delete Service %s: %w", name, err)
	}

	return nil
}

func (r *RaceServerRepository) deletePVC(
	ctx context.Context,
	name string,
) error {
	err := r.client.CoreV1().
		PersistentVolumeClaims(r.namespace).
		Delete(ctx, name, metav1.DeleteOptions{})

	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("delete PVC %s: %w", name, err)
	}

	return nil
}

func resourceName(matchID string, slot int) string {
	return fmt.Sprintf("race-%s-p%d", matchID, slot)
}

func resourceLabels(matchID string, slot int) map[string]string {
	return map[string]string{
		"app":                            resourceName(matchID, slot),
		"app.kubernetes.io/managed-by":   "race-controller",
		"race.hosokawa-lab.dev/match-id": matchID,
		"race.hosokawa-lab.dev/slot":     fmt.Sprintf("%d", slot),
	}
}

func (r *RaceServerRepository) WaitUntilReady(
	ctx context.Context,
	raceMatch *match.Match,
) error {
	err := wait.PollUntilContextCancel(
		ctx,
		5*time.Second,
		true,
		func(ctx context.Context) (bool, error) {
			for _, player := range raceMatch.Players {
				name := resourceName(
					raceMatch.ID,
					player.Slot,
				)

				deployment, err := r.client.AppsV1().
					Deployments(r.namespace).
					Get(
						ctx,
						name,
						metav1.GetOptions{},
					)

				if apierrors.IsNotFound(err) {
					return false, nil
				}

				if err != nil {
					if apierrors.IsForbidden(err) ||
						apierrors.IsUnauthorized(err) {
						return false, fmt.Errorf(
							"get deployment %s: %w",
							name,
							err,
						)
					}

					log.Printf(
						"temporary failure getting deployment: "+
							"deployment=%s error=%v",
						name,
						err,
					)

					return false, nil
				}

				if deployment.Status.AvailableReplicas < 1 {
					return false, nil
				}
			}

			return true, nil
		},
	)

	if err != nil {
		return fmt.Errorf("wait for race servers: %w", err)
	}

	return nil
}
