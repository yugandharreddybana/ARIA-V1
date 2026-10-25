interface StartMessage {
  type: 'start';
  prompt: string;
  stub: boolean;
}

function reply(message: unknown): void {
  if (typeof process.send === 'function') process.send(message);
}

process.on('message', (message: StartMessage) => {
  if (!message || message.type !== 'start') return;
  const envKeys = Object.keys(process.env).sort();
  if (message.prompt.includes('[[stub:env]]')) {
    reply({ type: 'result', text: JSON.stringify({ envKeys }), envKeys });
    return;
  }
  if (message.prompt.includes('"verdict"') || message.prompt.includes('verdict:')) {
    reply({
      type: 'result',
      text: '{"verdict":"pass","summary":"No blockers.","comments":[]}',
      envKeys,
    });
    return;
  }
  reply({ type: 'result', text: message.stub ? `stub planning\n${message.prompt.slice(0, 180)}` : 'local planner finished', envKeys });
});
