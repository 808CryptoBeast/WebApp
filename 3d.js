// 3d.js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("3dViewer").appendChild(renderer.domElement);

let currentObject;
let currentMaterial;

function init() {
    createCube();
    setMaterial('basic');
    setColor(0x00ff00);

    camera.position.z = 5;
}

function createCube() {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    currentObject = new THREE.Mesh(geometry, material);
    scene.add(currentObject);
}

function createSphere() {
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    currentObject = new THREE.Mesh(geometry, material);
    currentObject.position.x = 3;
    scene.add(currentObject);
}

function setMaterial(type) {
    switch (type) {
        case 'basic':
            currentMaterial = new THREE.MeshBasicMaterial({ color: currentObject.material.color });
            break;
        case 'phong':
            currentMaterial = new THREE.MeshPhongMaterial({ color: currentObject.material.color });
            break;
        case 'lambert':
            currentMaterial = new THREE.MeshLambertMaterial({ color: currentObject.material.color });
            break;
        default:
            break;
    }

    currentObject.material = currentMaterial;
}

function setColor(color) {
    currentObject.material.color.set(color);
}

function animate() {
    requestAnimationFrame(animate);

    // Rotation animation
    currentObject.rotation.x += 0.01;
    currentObject.rotation.y += 0.01;

    renderer.render(scene, camera);
}

init();
animate();

function changeObject(type) {
    scene.remove(currentObject);

    // Create new objects based on the button click
    if (type === 'cube') {
        createCube();
    } else if (type === 'sphere') {
        createSphere();
    }

    setMaterial('basic'); // Reset material to basic when changing objects
}

function changeMaterial(type) {
    setMaterial(type);
}

function changeColor(color) {
    setColor(color);
}
