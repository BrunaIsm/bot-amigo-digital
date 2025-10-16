import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Bot, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "👋 Olá! Sou o **Alpha Insights Sales Bot**. Estou pronto para analisar dados de vendas e responder suas perguntas sobre performance, produtos e regiões. Como posso ajudar?"
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [folderId, setFolderId] = useState("1nSxvMxzoNCgk7XbTkk83w77VlNoQ2aRR");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('sales-bot', {
        body: { query: userMessage, folderId }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.answer }
      ]);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao processar consulta",
        variant: "destructive",
      });
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "❌ Desculpe, ocorreu um erro ao processar sua consulta. Por favor, tente novamente."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center shadow-glow">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Alpha Insights</h1>
              <p className="text-xs text-muted-foreground">Sales Analytics Bot</p>
            </div>
          </div>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configurações</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="folderId">ID da Pasta do Google Drive</Label>
                  <Input
                    id="folderId"
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    placeholder="1nSxvMxzoNCgk7XbTkk83w77VlNoQ2aRR"
                  />
                  <p className="text-xs text-muted-foreground">
                    O ID da pasta que contém as planilhas de vendas
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Chat Container */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="h-[calc(100vh-180px)] flex flex-col bg-card/50 backdrop-blur-sm border-border/50">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0 shadow-glow">
                    <Bot className="w-5 h-5 text-primary-foreground" />
                  </div>
                )}
                
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground ml-auto"
                      : "bg-muted/50 text-foreground"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">{message.content}</p>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 text-accent-foreground font-semibold">
                    U
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0 animate-glow">
                  <Bot className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="bg-muted/50 rounded-2xl px-4 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border/40 bg-background/50">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite sua pergunta sobre vendas..."
                disabled={isLoading}
                className="flex-1 bg-background border-border/50 focus:border-primary transition-colors"
              />
              <Button 
                type="submit" 
                disabled={isLoading || !input.trim()}
                className="gradient-primary shadow-glow hover:shadow-glow"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Index;
