export type RingStyle = 'neon' | 'bubble' | 'orb' | 'pixel' | 'flat';
export type Voice = 'pop' | 'drop' | 'marimba' | 'bell' | 'chip' | 'pluck' | 'glass' | 'og';
export type Deco = 'dust' | 'bubbles' | 'stars' | 'grid' | 'scan' | 'none';
export type GoalId = 'games3' | 'score150' | 'fevers10' | 'daily5';

export type Unlock =
  | { kind: 'free' }
  | { kind: 'coins'; price: number }
  | { kind: 'goal'; goal: GoalId; label: string };

export interface Skin {
  id: string;
  name: string;
  tagline: string;
  style: RingStyle;
  voice: Voice;
  deco: Deco;
  /** Ring gradient. */
  a: string;
  b: string;
  /** Background gradient, top → bottom. */
  bg: [string, string];
  /** Soft moving color blobs behind everything. */
  aurora: [string, string, string];
  particles: string[];
  /** HUD / text color. */
  text: string;
  /** Light backgrounds use normal blending instead of additive glow. */
  light: boolean;
  rainbow?: boolean;
  /** Timer arc color (defaults to `a`). */
  timer?: string;
  unlock: Unlock;
}

export const SKINS: readonly Skin[] = [
  {
    id: 'neon',
    name: 'Neon',
    tagline: 'The 2026 original',
    style: 'neon',
    voice: 'pop',
    deco: 'dust',
    a: '#25F4FF',
    b: '#FF3DD8',
    bg: ['#0a0822', '#1f0b3d'],
    aurora: ['#5b2bff', '#ff2fb5', '#00c8ff'],
    particles: ['#25F4FF', '#FF3DD8', '#FFFFFF', '#9C8BFF'],
    text: '#FFFFFF',
    light: false,
    unlock: { kind: 'free' },
  },
  {
    id: 'og',
    name: 'OG',
    tagline: 'Where it all began',
    style: 'flat',
    voice: 'og',
    deco: 'none',
    a: '#3232DD',
    b: '#3232DD',
    bg: ['#FFFFFF', '#F1F2F8'],
    aurora: ['#e2e4ff', '#ffe6e6', '#e2f5ff'],
    particles: ['#3232DD', '#6B6BFF', '#FF3B3B', '#111111'],
    text: '#15152A',
    light: true,
    timer: '#FF1F1F',
    unlock: { kind: 'goal', goal: 'games3', label: 'Play 3 games' },
  },
  {
    id: 'bubbles',
    name: 'Bubbles',
    tagline: 'Soapy, bouncy, satisfying',
    style: 'bubble',
    voice: 'drop',
    deco: 'bubbles',
    a: '#7FE7FF',
    b: '#B79CFF',
    bg: ['#05213f', '#0a5580'],
    aurora: ['#00b3ff', '#6f5bff', '#00ffc8'],
    particles: ['#BFF4FF', '#7FE7FF', '#FFFFFF', '#B79CFF'],
    text: '#FFFFFF',
    light: false,
    unlock: { kind: 'coins', price: 250 },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    tagline: 'Synthwave forever',
    style: 'neon',
    voice: 'pluck',
    deco: 'grid',
    a: '#FFC23D',
    b: '#FF3D6E',
    bg: ['#150828', '#4d1238'],
    aurora: ['#ff6a3d', '#ff2e88', '#7a2bff'],
    particles: ['#FFC23D', '#FF3D6E', '#FF8A3D', '#FFFFFF'],
    text: '#FFFFFF',
    light: false,
    unlock: { kind: 'coins', price: 400 },
  },
  {
    id: 'toxic',
    name: 'Toxic',
    tagline: 'Radioactive glow',
    style: 'orb',
    voice: 'marimba',
    deco: 'dust',
    a: '#D2FF3D',
    b: '#12C98A',
    bg: ['#030f08', '#0a2a1a'],
    aurora: ['#3dff7a', '#00ffb3', '#b6ff00'],
    particles: ['#D2FF3D', '#3DFFA2', '#FFFFFF', '#12C98A'],
    text: '#EFFFF4',
    light: false,
    unlock: { kind: 'coins', price: 600 },
  },
  {
    id: 'arcade',
    name: 'Arcade',
    tagline: 'Insert coin',
    style: 'pixel',
    voice: 'chip',
    deco: 'scan',
    a: '#FFD23F',
    b: '#FF4E6A',
    bg: ['#0c0c1c', '#1d1238'],
    aurora: ['#ff4e6a', '#3d7bff', '#ffd23f'],
    particles: ['#FFD23F', '#FF4E6A', '#3DDCFF', '#FFFFFF'],
    text: '#FFFFFF',
    light: false,
    unlock: { kind: 'coins', price: 900 },
  },
  {
    id: 'candy',
    name: 'Candy',
    tagline: 'Sweet tooth',
    style: 'bubble',
    voice: 'marimba',
    deco: 'bubbles',
    a: '#FF5FAE',
    b: '#6F7CFF',
    bg: ['#FFE4F2', '#E0E6FF'],
    aurora: ['#ff9ad0', '#9ab0ff', '#ffd59a'],
    particles: ['#FF5FAE', '#6F7CFF', '#FFB443', '#35C8A0'],
    text: '#3A1D4F',
    light: true,
    unlock: { kind: 'coins', price: 1200 },
  },
  {
    id: 'cosmic',
    name: 'Cosmic',
    tagline: 'Pop the universe',
    style: 'orb',
    voice: 'bell',
    deco: 'stars',
    a: '#B49BFF',
    b: '#FF6FD8',
    bg: ['#02010a', '#150a33'],
    aurora: ['#4b2bff', '#b02bff', '#2b8cff'],
    particles: ['#B49BFF', '#FF6FD8', '#FFFFFF', '#6FC3FF'],
    text: '#FFFFFF',
    light: false,
    unlock: { kind: 'coins', price: 1600 },
  },
  {
    id: 'midas',
    name: 'Midas',
    tagline: 'Everything you touch…',
    style: 'neon',
    voice: 'glass',
    deco: 'dust',
    a: '#FFF1B0',
    b: '#FFA800',
    bg: ['#0c0800', '#261a00'],
    aurora: ['#ffb300', '#ff7a00', '#ffe08a'],
    particles: ['#FFE38A', '#FFB300', '#FFFFFF', '#FF8A00'],
    text: '#FFF6DA',
    light: false,
    unlock: { kind: 'goal', goal: 'score150', label: 'Score 150 in one run' },
  },
  {
    id: 'prism',
    name: 'Prism',
    tagline: 'All the colors at once',
    style: 'neon',
    voice: 'pop',
    deco: 'stars',
    a: '#FF3D6E',
    b: '#3DC8FF',
    bg: ['#08080f', '#16162b'],
    aurora: ['#ff3d6e', '#3dffa2', '#3d7bff'],
    particles: ['#FF3D6E', '#FFC23D', '#3DFFA2', '#3DC8FF', '#B03DFF'],
    text: '#FFFFFF',
    light: false,
    rainbow: true,
    unlock: { kind: 'goal', goal: 'fevers10', label: 'Trigger FEVER 10 times' },
  },
  {
    id: 'mono',
    name: 'Mono',
    tagline: 'Less is more',
    style: 'flat',
    voice: 'bell',
    deco: 'none',
    a: '#FFFFFF',
    b: '#FFFFFF',
    bg: ['#050505', '#141414'],
    aurora: ['#333333', '#222222', '#2a2a2a'],
    particles: ['#FFFFFF', '#BBBBBB', '#777777'],
    text: '#FFFFFF',
    light: false,
    unlock: { kind: 'goal', goal: 'daily5', label: 'Daily streak of 5' },
  },
];

export const DEFAULT_SKIN = 'neon';

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

export const GOLD = { a: '#FFF3B0', b: '#FFB020', glow: '#FFC53D' };
export const DANGER = '#FF2D55';
export const POWER_COLORS = { shield: '#3DFFA2', slow: '#58B7FF', double: '#FF9F1C' } as const;
