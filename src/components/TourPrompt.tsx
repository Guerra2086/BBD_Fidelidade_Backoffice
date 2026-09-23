import { Modal } from './Modal';

export function TourPrompt({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <Modal
      open
      onClose={onDismiss}
      title="Queres uma visita guiada?"
      icon="info"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onDismiss}>
            Agora não
          </button>
          <button className="btn btn-red" onClick={onStart}>
            Sim, mostra-me
          </button>
        </>
      }
    >
      <p>
        Esta é a primeira vez que entras no backoffice. Posso mostrar-te rapidamente onde fica cada coisa — o tour anda
        pelo site sozinho, sem criar nem alterar nada. Podes repetir isto mais tarde no botão de ajuda junto ao sino de
        alertas.
      </p>
    </Modal>
  );
}
