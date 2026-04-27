import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, Volume2, VolumeX, Mic } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';
import { toast } from '@/components/ui/toast-utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIChatAssistant() {
  const { token, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: "VOICE ENGINE ACTIVE: Ask me anything about your inventory, sales, or how to maximize your profits today."
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    isListening,
    supported,
    toggleListening,
    speak,
    cancelSpeech
  } = useVoice((transcript) => {
    setInput(transcript);
    // Auto-send when speaking is done
    setTimeout(() => {
      handleSendWithText(transcript);
    }, 500);
  });

  // Handle bot speech
  useEffect(() => {
    if (voiceEnabled && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        speak(lastMessage.content);
      }
    }
  }, [messages, voiceEnabled, speak]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Only allow ADMIN to see the business assistant
  if (!user || !token || user.role !== 'ADMIN') return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', content: userMsg } as Message];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMsg,
          // Exclude the very first greeting from history to save tokens
          history: newMessages.slice(1, -1) 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to communicate with AI');
      }

      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (error: any) {
      console.error('Chat error:', error);
      toast.error(error.message || 'Error communicating with AI assistant.');
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, I am having trouble accessing the business data right now. Please try again later.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendWithText = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg = text.trim();
    const newMessages = [...messages, { role: 'user', content: userMsg } as Message];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMsg,
          history: newMessages.slice(1, -1) 
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to communicate with AI');

      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (error: any) {
      console.error('Chat error:', error);
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, I am having trouble accessing the business data right now.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-24 md:bottom-6 right-6 z-40 flex flex-col items-end pointer-events-none">
      {/* Chat Window */}
      {isOpen && (
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-80 sm:w-96 h-[500px] max-h-[80vh] flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto">
          {/* Header */}
          <div className="bg-muted border-b border-border p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-profit/20 rounded-lg text-profit">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-foreground text-sm">Profit Engine AI</h3>
                <p className="text-[10px] text-profit uppercase tracking-widest font-black">Growth Expert</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Voice Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  if (!supported.synthesis) {
                    toast.error('Text-to-speech is not supported by your browser.');
                    return;
                  }
                  if (voiceEnabled) cancelSpeech();
                  setVoiceEnabled(!voiceEnabled);
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all ${voiceEnabled ? 'bg-profit/20 border-profit/40 text-profit' : 'bg-muted border-border text-muted-foreground'} ${!supported.synthesis ? 'opacity-50 cursor-not-allowed' : 'hover:border-profit/50'}`}
                title={!supported.synthesis ? 'Speech not supported' : (voiceEnabled ? 'Disable Voice' : 'Enable Voice')}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="text-[9px] font-black uppercase">Voice</span>
              </button>

              <button 
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 bg-muted/50 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-600' : 'bg-profit/20 text-profit'}`}>
                  {msg.role === 'user' ? <User className="w-4 h-4 text-foreground" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[75%] rounded-2xl p-3 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-foreground rounded-tr-none' : 'bg-muted text-muted-foreground border border-border rounded-tl-none'}`}>
                   {/* Simple line break rendering for text */}
                   {msg.content.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {line}
                        {i !== msg.content.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-profit/20 text-profit flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-muted border border-border rounded-2xl p-4 rounded-tl-none flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-profit rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-profit rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-profit rounded-full animate-bounce"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} className="p-3 bg-card border-t border-border">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about inventory or profit..."
                className="w-full bg-muted border border-border rounded-full pl-4 pr-24 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-profit/50 focus:ring-1 focus:ring-profit/50 transition-all font-body"
                disabled={isLoading}
              />
              <div className="absolute right-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!supported.speech) {
                      toast.error('Speech recognition is not supported by your browser.');
                      return;
                    }
                    toggleListening();
                  }}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all ${isListening ? 'bg-profit text-profit-foreground animate-pulse shadow-lg' : 'bg-muted text-muted-foreground hover:text-profit'} ${!supported.speech ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={!supported.speech ? 'Speech recognition not supported' : 'Voice Input'}
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold">Talk</span>
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="w-9 h-9 flex items-center justify-center bg-profit text-profit-foreground rounded-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-profit/90 transition-colors"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-profit hover:bg-profit/90 text-profit-foreground rounded-full shadow-lg shadow-profit/20 flex items-center justify-center transition-all hover:scale-105 active:scale-95 animate-in zoom-in pointer-events-auto"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
