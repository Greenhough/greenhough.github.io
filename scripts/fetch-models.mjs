// Fetches the three models the room borrows from BlenderKit into build/models/.
//
//     node scripts/fetch-models.mjs
//
// They are not committed. All three are under BlenderKit's Royalty Free
// licence, which lets them be used in a project and does not let the model
// itself be passed on, and this repository is public. So what is committed is
// which asset and which file; scripts/shelf.py reads them from build/models/
// and bakes them into the room, and the only place their geometry ends up is
// inside shelf.glb with everything else.
//
// The 1K files are the ones asked for. The room atlas gives a hundred texels
// to the unit, so a lamp's own 4K textures would be thrown away by the bake.
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build', 'models');
const api = 'https://www.blenderkit.com/api/v1';
const headers = { 'User-Agent': 'asset-fetch/1.0' };

const MODELS = [
  // Arch Dome Floor Lamp, by Mobolaji_3D Dele-Adelodun.
  { file: 'floor-lamp.blend', asset: 'e80935ea-dca1-42b9-8f03-30fff78bfd7e', want: 'resolution_1K' },
  // Table lamp with minor scratches, by its BlenderKit author.
  { file: 'desk-lamp.blend', asset: '3753c64a-49da-403c-8a57-9f3c3fe58e42', want: 'resolution_1K' },
  // Office Wall Clock, by Demycs.
  { file: 'wall-clock.blend', asset: '72c01a0b-84e3-475e-9ab9-b4697fb05074', want: 'resolution_1K' },
];

const scene = randomUUID();
await mkdir(out, { recursive: true });

for (const model of MODELS) {
  const target = path.join(out, model.file);
  if (await stat(target).then(() => true, () => false)) {
    console.log(`[models] have ${model.file}`);
    continue;
  }
  const search = await fetch(`${api}/search/?query=asset_base_id:${model.asset}`, { headers }).then((r) => r.json());
  const asset = search.results?.[0];
  if (!asset) throw new Error(`no such asset: ${model.asset}`);
  const files = asset.files ?? [];
  const pick = files.find((f) => f.fileType === model.want) ?? files.find((f) => f.fileType === 'blend');
  if (!pick) throw new Error(`${asset.name} has no .blend to download`);
  const ticket = await fetch(`${pick.downloadUrl}?scene_uuid=${scene}`, { headers }).then((r) => r.json());
  if (!ticket.filePath) throw new Error(`${asset.name}: ${JSON.stringify(ticket).slice(0, 200)}`);
  const body = await fetch(ticket.filePath, { headers });
  if (!body.ok) throw new Error(`${asset.name}: ${body.status}`);
  await writeFile(target, Buffer.from(await body.arrayBuffer()));
  const { size } = await stat(target);
  console.log(`[models] ${model.file}  ${asset.name}, ${pick.fileType}, ${(size / 1e6).toFixed(1)}MB, ${asset.license}`);
}
