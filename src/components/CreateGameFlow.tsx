import { CreateGameFlowEnhanced } from './CreateGameFlowEnhanced';

interface CreateGameFlowProps {
  open: boolean;
  onClose: () => void;
  onGameCreated?: (game: any) => void;
}

export function CreateGameFlow({ open, onClose, onGameCreated }: CreateGameFlowProps) {
  // Back to enhanced version with fixes
  return <CreateGameFlowEnhanced open={open} onClose={onClose} onGameCreated={onGameCreated} />;
}