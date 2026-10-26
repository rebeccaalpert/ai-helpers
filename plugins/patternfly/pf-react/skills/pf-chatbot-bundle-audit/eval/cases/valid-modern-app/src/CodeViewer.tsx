import CodeModal from '@patternfly/chatbot/dist/dynamic/CodeModal';

export function CodeViewer() {
  return <CodeModal title="Test code modal" handleModalToggle={() => void} primaryActionBtn="Save" secondaryActionBtn="Cancel" onPrimaryAction={() => void} onSecondaryAction={() => void} code="const valid = true;" fileName="test.js" isModalOpen={true} />;
}