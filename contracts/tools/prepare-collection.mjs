#!/usr/bin/env node
// Turns the drawn collection into the exact shape the contract and the
// marketplaces expect, without touching the originals.
//
//   node tools/prepare-collection.mjs \
//     --src ../THE_LINE_FINAL_3333_5PX_FAST \
//     --out ./upload \
//     --image-base ipfs://<IMAGES_CID>/
//
// Two things change:
//   1. Filenames lose the zero padding. `tokenURI` is built as
//      baseURI + tokenId + ".json", and Solidity renders token 1 as "1", not
//      "0001". A padded file would 404 for every single token.
//   2. `image` becomes an absolute URI. A bare "0001.png" resolves against
//      nothing once the JSON is on IPFS, and the artwork never loads.
//
// Requires: npm i viem
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { keccak256 } from 'viem'

const TOTAL = 3333

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]
  if (fallback !== undefined) return fallback
  throw new Error(`missing --${name}`)
}

const src = arg('src')
const out = arg('out', './upload')
const imageBase = arg('image-base', '')

const srcImages = join(src, 'images')
const srcMeta = join(src, 'metadata')
const outImages = join(out, 'images')
const outMeta = join(out, 'metadata')
mkdirSync(outImages, { recursive: true })
mkdirSync(outMeta, { recursive: true })

const pad = n => String(n).padStart(4, '0')
const imageHashes = []
const problems = []

for (let id = 1; id <= TOTAL; id++) {
  const imageIn = join(srcImages, `${pad(id)}.png`)
  const metaIn = join(srcMeta, `${pad(id)}.json`)
  if (!existsSync(imageIn)) { problems.push(`missing image ${pad(id)}.png`); continue }
  if (!existsSync(metaIn)) { problems.push(`missing metadata ${pad(id)}.json`); continue }

  const bytes = readFileSync(imageIn)
  imageHashes.push(keccak256(bytes))
  copyFileSync(imageIn, join(outImages, `${id}.png`))

  const meta = JSON.parse(readFileSync(metaIn, 'utf8'))

  // The eight traits are carried through untouched. Nothing is collapsed to
  // rarity alone: Formation, Position, Length, Width and Density are the
  // reason the collection reads as a study rather than a set of pictures.
  const attributes = meta.attributes
  if (!Array.isArray(attributes) || attributes.length !== 8) {
    problems.push(`${pad(id)}: expected 8 attributes, found ${attributes?.length}`)
  }

  writeFileSync(join(outMeta, `${id}.json`), JSON.stringify({
    name: meta.name,
    description: meta.description,
    image: `${imageBase}${id}.png`,
    attributes,
  }, null, 2))
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  problems.slice(0, 20).forEach(p => console.error('  ' + p))
  process.exit(1)
}

// Provenance: the hash of every image hash, in token-id order. Published before
// the sale opens, it is the proof that the artwork behind each id was fixed in
// advance — nobody can rearrange assignments after seeing who minted what.
const provenance = keccak256(`0x${imageHashes.map(h => h.slice(2)).join('')}`)

writeFileSync(join(out, 'provenance.json'), JSON.stringify({
  algorithm: 'keccak256( keccak256(image[1]) || keccak256(image[2]) || ... || keccak256(image[3333]) )',
  total: TOTAL,
  provenanceHash: provenance,
  imageHashes,
}, null, 2))

console.log(`prepared ${TOTAL} works -> ${out}`)
console.log(`PROVENANCE_HASH=${provenance}`)
