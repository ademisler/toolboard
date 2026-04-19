export const metadata = {
  id: 'mock-tool',
  name: 'Mock Tool',
  category: 'inspect',
  icon: 'info',
  shortcut: {
    default: 'Alt+Shift+1',
    mac: 'Alt+Shift+1'
  },
  permissions: ['activeTab'],
  tags: ['mock'],
  keywords: ['mock']
};

export function activate() {
  return true;
}

export function deactivate() {
  return true;
}
