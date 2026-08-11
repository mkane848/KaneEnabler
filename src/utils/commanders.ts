import type { CommanderId } from '../types';

export const COMMANDER_NAME: Record<CommanderId, string> = {
  tenthDoctor: 'The Tenth Doctor',
  roseTyler: 'Rose Tyler',
};

export const COMMANDER_IDS: readonly CommanderId[] = ['tenthDoctor', 'roseTyler'];
