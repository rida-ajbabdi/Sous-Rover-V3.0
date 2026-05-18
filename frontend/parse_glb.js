const fs = require('fs');

const buffer = fs.readFileSync('./model 3D/agricultural_robot.glb');
// Read magic
const magic = buffer.readUInt32LE(0);
if (magic !== 0x46546C67) {
  console.error("Not a GLB");
  process.exit(1);
}

const version = buffer.readUInt32LE(4);
const length = buffer.readUInt32LE(8);

let offset = 12;
const chunk0Length = buffer.readUInt32LE(offset);
const chunk0Type = buffer.readUInt32LE(offset + 4);

if (chunk0Type !== 0x4E4F534A) {
  console.error("Chunk 0 is not JSON");
  process.exit(1);
}

const jsonBuffer = buffer.slice(offset + 8, offset + 8 + chunk0Length);
const jsonString = jsonBuffer.toString('utf-8');
const gltf = JSON.parse(jsonString);

console.log("Nodes:");
gltf.nodes.forEach((node, idx) => {
  console.log(`Node ${idx}: ${node.name}`);
  if (node.translation) console.log(`  Translation: ${node.translation}`);
  if (node.children) console.log(`  Children: ${node.children}`);
});

console.log("\nMeshes:");
if (gltf.meshes) {
  gltf.meshes.forEach((mesh, idx) => {
    console.log(`Mesh ${idx}: ${mesh.name}`);
  });
}
