import * as THREE from 'three';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import Stats from 'stats.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Setup Three.js
const scene = new THREE.Scene();
scene.scale.set(-1, 1, 1); // Mirror the scene horizontally

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('container').appendChild(renderer.domElement);

// Add Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(2, 2, 2);
scene.add(directionalLight);

const pointLight = new THREE.PointLight(0xffffff, 0.5);
pointLight.position.set(0, 0, 1);
scene.add(pointLight);

// Create Lines with Thicker Material
const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x00ff00,
    linewidth: 80 // Increase this to make the lines thicker
});
const handLines = [[], []]; // Separate arrays to hold lines for each hand

const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index
    [0, 9], [9, 10], [10, 11], [11, 12], // Middle
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring
    [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
];

// Create lines for each hand
for (let handIndex = 0; handIndex < 2; handIndex++) {
    connections.forEach(() => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(6);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const line = new THREE.LineSegments(geometry, lineMaterial.clone()); // Use LineSegments for more flexibility
        handLines[handIndex].push(line);
        scene.add(line);
    });
}

camera.position.set(0, 0, -1);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;
controls.enableZoom = true;

// MediaPipe Hands Setup
const videoElement = document.createElement('video');
videoElement.width = 640;
videoElement.height = 480;
videoElement.autoplay = true;
videoElement.style.position = 'absolute';
videoElement.style.bottom = '0';
videoElement.style.left = '0';
videoElement.style.width = '200px';
videoElement.style.height = '150px';
videoElement.style.border = '2px solid white';
document.body.appendChild(videoElement);

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

const cameraFeed = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});
cameraFeed.start();

// FPS Setup
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// Sliding window parameters
const smoothingWindow = 3; // Adjusted smoothing window size
let landmarkHistory = [[], []]; // Store previous landmarks for both hands

function onResults(results) {
    stats.begin();

    // Hide all lines initially
    handLines.forEach(lines => lines.forEach(line => line.visible = false));

    if (results.multiHandLandmarks) {
        results.multiHandLandmarks.forEach((landmarks, handIndex) => {
            if (landmarks) {
                updateLines(landmarks, handIndex);
            }
        });
    }

    stats.end();
    controls.update();
    renderer.render(scene, camera);
}

function updateLines(landmarks, handIndex) {
    connections.forEach(([startIdx, endIdx], connectionIndex) => {
        const line = handLines[handIndex][connectionIndex];
        const startLandmark = landmarks[startIdx];
        const endLandmark = landmarks[endIdx];

        if (startLandmark && endLandmark) {
            // Initialize landmark history if not already done
            if (!landmarkHistory[handIndex][startIdx]) {
                landmarkHistory[handIndex][startIdx] = Array(smoothingWindow).fill({ x: startLandmark.x, y: startLandmark.y, z: startLandmark.z });
            }
            if (!landmarkHistory[handIndex][endIdx]) {
                landmarkHistory[handIndex][endIdx] = Array(smoothingWindow).fill({ x: endLandmark.x, y: endLandmark.y, z: endLandmark.z });
            }

            // Update landmark history
            landmarkHistory[handIndex][startIdx].shift();
            landmarkHistory[handIndex][startIdx].push(startLandmark);

            landmarkHistory[handIndex][endIdx].shift();
            landmarkHistory[handIndex][endIdx].push(endLandmark);

            // Compute average position over the smoothing window
            const smoothedStartLandmark = averageLandmark(landmarkHistory[handIndex][startIdx]);
            const smoothedEndLandmark = averageLandmark(landmarkHistory[handIndex][endIdx]);

            // Update line positions with smoothed values
            const positions = line.geometry.attributes.position.array;
            positions[0] = -(smoothedStartLandmark.x * 2 - 1) * 0.5;
            positions[1] = -(smoothedStartLandmark.y * 2 - 1) * 0.5;
            positions[2] = -smoothedStartLandmark.z;
            positions[3] = -(smoothedEndLandmark.x * 2 - 1) * 0.5;
            positions[4] = -(smoothedEndLandmark.y * 2 - 1) * 0.5;
            positions[5] = -smoothedEndLandmark.z;
            line.geometry.attributes.position.needsUpdate = true;

            // Make the line visible
            line.visible = true;
        }
    });
}

function averageLandmark(landmarks) {
    const sum = landmarks.reduce((acc, landmark) => {
        acc.x += landmark.x;
        acc.y += landmark.y;
        acc.z += landmark.z;
        return acc;
    }, { x: 0, y: 0, z: 0 });

    return {
        x: sum.x / landmarks.length,
        y: sum.y / landmarks.length,
        z: sum.z / landmarks.length
    };
}

window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
});
// This is original code