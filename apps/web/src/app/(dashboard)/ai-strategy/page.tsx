'use client';
import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, Bot, User, AlertCircle, Zap } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const SYSTEM_PROMPT = `You are ARIA, an Autonomous Repository Intelligence Agent. You are the AI Strategy advisor for a software engineering team. You help with:
- Sprint planning and prioritization
- Technical architecture decisions
- Risk assessment and mitigation
- Feature ideation and feasibility
- Code quality and tech debt strategy

Be concise, direct, and technically precise. Always consider risk, effort, and business impact.`;

export default function AIStrategyPage() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [model, setModel]         = useState('llama3');
  const [models, setModels]       = useState<string[]>(['llama3']);
  const [ollamaOk, setOllamaOk]  = useState<boolean | null>(null);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<{ models: string[] }>('/ai/models')
      .then(d => { if (d.models.length) { setModels(d.models); setModel(d.models[0]); setOllamaOk(true); } else { setOllamaOk(false); } })
      .catch(() => setOllamaOk(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true); setError('');
    try {
      const payload = [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...newMessages];
      const d = await api<{ message: Message; model: string }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: payload, model }),
      });
      setMessages(prev => [...prev, d.message]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to reach Ollama');
    } finally { setLoading(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-aria-400" />
          <div>
            <h1 className="text-lg font-bold">AI Strategy</h1>
            <p className="text-xs text-muted-foreground">Chat with ARIA — your AI engineering advisor</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {ollamaOk === false && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />Ollama offline
            </div>
          )}
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{models.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}</SelectContent>
          </Select>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setMessages([])}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 py-20">
            <Bot className="h-12 w-12 opacity-20" />
            <p className="font-medium">Ask ARIA anything</p>
            <div className="flex flex-col gap-2 items-center">
              {['Help me plan the next sprint', 'What are the riskiest parts of the codebase?', 'Suggest features based on current tickets'].map(s => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-xs text-muted-foreground hover:text-foreground border border-border hover:border-aria-500/40 rounded-lg px-4 py-2 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && <Bot className="h-5 w-5 text-aria-400 shrink-0 mt-0.5" />}
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-aria-600/20 border border-aria-500/30 text-foreground'
                  : 'bg-muted text-foreground'
              }`}>
                <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
              </div>
              {m.role === 'user' && <User className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-3">
            <Bot className="h-5 w-5 text-aria-400 shrink-0 mt-0.5" />
            <div className="bg-muted rounded-xl px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />{error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-border">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask ARIA… (Enter to send, Shift+Enter for new line)"
            disabled={loading || ollamaOk === false}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <Button variant="aria" size="sm" onClick={send} disabled={loading || !input.trim() || ollamaOk === false}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Powered by Ollama · {model}</p>
      </div>
    </div>
  );
}
