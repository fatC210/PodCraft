import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Locale = "zh" | "en";

type Translations = typeof zh;

const zh = {
  // Sidebar
  nav: {
    workspace: "工作台",
    create: "创建",
    history: "历史",
    settings: "设置",
  },
  // Index
  index: {
    workspace: "工作台",
    createNew: "创建新播客",
    ready: "准备就绪",
    startVoice: "开始语音创作",
    startVoiceDesc: "通过语音对话完成从素材搜集、脚本编写、音色选择到播客输出的全流程。",
    recentPodcasts: "近期播客",
    records: "条记录",
    footer: "PODCRAFT v0.1 — STUDIO SYSTEM",
  },
  // Voice Studio
  studio: {
    title: "语音创作工作台",
    stages: ["确定主题", "筛选素材", "生成脚本", "选择音色", "生成播客"],
    you: "你",
    processing: "处理中",
    recording: "● 录音中",
    ready: "准备就绪",
    inputPlaceholder: "输入文字消息，或按住麦克风说话…",
    greeting: "你好！我是你的播客制作助手。请告诉我你想制作什么主题的播客？你可以按住麦克风按钮说话，也可以输入文字。",
    mockVoiceInput: "我想做一期关于量子计算最新进展的播客",
    responses: {
      default: `收到！让我为你搜索相关资料……已找到 3 条相关内容，我来逐一播报：\n\n**1.** 该领域最新研究进展综述，来源：Nature Science Review\n\n**2.** 行业专家访谈摘要，来源：Tech Insights Daily\n\n**3.** 相关技术应用案例分析，来源：MIT Technology Review\n\n你想保留哪些素材？可以说"保留第一条"或"跳过第二条"。`,
      keep: `好的，已保留该素材。还有其他需要调整的吗？如果素材确认完毕，我们可以进入下一步——设置播客参数。`,
      next: `素材已确认完毕。现在让我们设置播客参数：\n\n• **输出语言**：中文\n• **角色数量**：2 位\n• **角色名称**：待确认\n\n请告诉我角色名称，例如"主持人叫小明，嘉宾叫小红"。`,
      script: `脚本已生成！以下是概要：\n\n**开场**（0:00-0:30）：主持人介绍本期主题\n**正文**（0:30-4:00）：围绕素材展开深入讨论\n**总结**（4:00-5:00）：回顾要点并展望\n\n总时长约 5 分钟。你想试听或修改脚本吗？`,
      voice: `现在为角色选择音色。我为你准备了几个音色样本：\n\n🔊 **音色 1** — Roger：沉稳专业的男声\n🔊 **音色 2** — Sarah：温和清晰的女声\n🔊 **音色 3** — George：富有磁性的男声\n\n说"试听第一个"来预览，或直接选择。`,
      generate: `所有参数已确认！开始合成播客音频……\n\n⏳ 正在处理脚本段落 1/6\n⏳ 正在合成角色语音\n⏳ 正在拼接音频片段\n\n预计需要 30 秒左右完成。`,
    },
    keywords: {
      keep: ["保留"],
      next: ["下一步", "确认", "没问题"],
      script: ["脚本"],
      voice: ["音色", "试听"],
      generate: ["生成", "开始"],
      topic: ["播客", "主题"],
    },
  },
  // History
  history: {
    label: "历史记录",
    title: "播客档案",
    materials: "素材",
    footer: (n: number) => `共 ${n} 条记录 — 本地存储`,
  },
  // Settings
  settings: {
    label: "设置",
    title: "系统配置",
    aiProviders: "AI 模型供应商",
    add: "添加",
    apiUrl: "API 地址",
    apiKey: "API Key",
    models: "模型",
    modelsLoading: "模型加载中…",
    providerName: "供应商名称（如 DeepSeek）",
    baseUrl: "API 地址（Base URL）",
    save: "保存",
    cancel: "取消",
    services: "服务配置",
    webScraping: "网页抓取",
    footer: "配置数据存储在本地 — 不会上传至任何服务器",
    language: "界面语言",
  },
};

const en: Translations = {
  nav: {
    workspace: "Workspace",
    create: "Create",
    history: "History",
    settings: "Settings",
  },
  index: {
    workspace: "WORKSPACE",
    createNew: "Create Podcast",
    ready: "READY",
    startVoice: "Start Voice Creation",
    startVoiceDesc: "Complete the entire podcast workflow through voice conversation — from material gathering, script writing, voice selection to audio output.",
    recentPodcasts: "Recent Podcasts",
    records: "records",
    footer: "PODCRAFT v0.1 — STUDIO SYSTEM",
  },
  studio: {
    title: "VOICE CREATION STUDIO",
    stages: ["Set Topic", "Select Material", "Generate Script", "Choose Voice", "Generate Podcast"],
    you: "You",
    processing: "Processing",
    recording: "● Recording",
    ready: "Ready",
    inputPlaceholder: "Type a message, or hold the mic to speak…",
    greeting: "Hello! I'm your podcast production assistant. Tell me what topic you'd like to create a podcast about. You can hold the mic button to speak, or type your message.",
    mockVoiceInput: "I want to make a podcast about the latest advances in quantum computing",
    responses: {
      default: `Got it! Let me search for related materials… Found 3 relevant results, here's a summary:\n\n**1.** Latest research review in this field — Source: Nature Science Review\n\n**2.** Industry expert interview summary — Source: Tech Insights Daily\n\n**3.** Related technology application case study — Source: MIT Technology Review\n\nWhich materials would you like to keep? Say "keep the first one" or "skip the second".`,
      keep: `OK, material has been kept. Anything else to adjust? If materials are confirmed, we can move to the next step — setting podcast parameters.`,
      next: `Materials confirmed. Now let's set podcast parameters:\n\n• **Output Language**: Chinese\n• **Number of Roles**: 2\n• **Role Names**: To be confirmed\n\nPlease tell me the role names, e.g. "Host is Alex, Guest is Sam".`,
      script: `Script generated! Here's a summary:\n\n**Opening** (0:00-0:30): Host introduces the topic\n**Main Content** (0:30-4:00): In-depth discussion around materials\n**Summary** (4:00-5:00): Key takeaways and outlook\n\nTotal duration ~5 minutes. Would you like to preview or edit the script?`,
      voice: `Now let's choose voices for each role. Here are some voice samples:\n\n🔊 **Voice 1** — Roger: Deep, professional male voice\n🔊 **Voice 2** — Sarah: Warm, clear female voice\n🔊 **Voice 3** — George: Rich, magnetic male voice\n\nSay "preview the first one" to listen, or choose directly.`,
      generate: `All parameters confirmed! Starting podcast synthesis…\n\n⏳ Processing script segment 1/6\n⏳ Synthesizing character voices\n⏳ Stitching audio clips\n\nEstimated time: ~30 seconds.`,
    },
    keywords: {
      keep: ["keep", "保留"],
      next: ["next", "confirm", "looks good", "下一步", "确认", "没问题"],
      script: ["script", "脚本"],
      voice: ["voice", "preview", "listen", "音色", "试听"],
      generate: ["generate", "start", "生成", "开始"],
      topic: ["podcast", "topic", "播客", "主题"],
    },
  },
  history: {
    label: "HISTORY",
    title: "Podcast Archive",
    materials: "materials",
    footer: (n: number) => `${n} records — Local Storage`,
  },
  settings: {
    label: "SETTINGS",
    title: "System Configuration",
    aiProviders: "AI MODEL PROVIDERS",
    add: "Add",
    apiUrl: "API URL",
    apiKey: "API Key",
    models: "Models",
    modelsLoading: "Loading models…",
    providerName: "Provider name (e.g. DeepSeek)",
    baseUrl: "API URL (Base URL)",
    save: "Save",
    cancel: "Cancel",
    services: "SERVICE CONFIGURATION",
    webScraping: "Web Scraping",
    footer: "Configuration stored locally — never uploaded to any server",
    language: "Interface Language",
  },
};

const translations: Record<Locale, Translations> = { zh, en };

type I18nContextType = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translations;
};

const I18nContext = createContext<I18nContextType>({
  locale: "zh",
  setLocale: () => {},
  t: zh,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("podcraft-locale");
    return (saved === "en" ? "en" : "zh") as Locale;
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("podcraft-locale", l);
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
