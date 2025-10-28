import { CreateGameFlowEnhanced } from './CreateGameFlowEnhanced';

interface CreateGameFlowProps {
  open: boolean;
  onClose: () => void;
  onGameCreated?: (game: any) => void;
  initialTurfId?: string;
}

export function CreateGameFlow({ open, onClose, onGameCreated, initialTurfId }: CreateGameFlowProps) {
  // Back to enhanced version with fixes
  return <CreateGameFlowEnhanced open={open} onClose={onClose} onGameCreated={onGameCreated} initialTurfId={initialTurfId} />;
}