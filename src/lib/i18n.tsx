import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Locale = "zh" | "en";

type Translations = typeof zh;

const zh = {
  nav: {
    workspace: "工作台",
    create: "创建",
    history: "历史",
    settings: "设置",
  },
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
  studio: {
    title: "语音创作工作台",
    stages: ["确定主题", "筛选素材", "生成脚本", "选择音色", "生成播客"],
    you: "你",
    processing: "思考中…",
    listening: "聆听中…",
    speaking: "AI 正在说话…",
    connecting: "正在连接…",
    endCall: "结束对话",
    callDuration: "通话时长",
    transcript: "对话记录",
    greeting: "你好！我是你的播客制作助手。今天想做一期什么主题的播客呢？你可以随时开口说话，我会实时听你说。",
    mockVoiceInput: "我想做一期关于量子计算最新进展的播客",
    responses: {
      default: `收到！让我为你搜索量子计算相关的资料……已找到 3 条相关内容。第一条是该领域最新研究进展综述，来源 Nature Science Review。第二条是行业专家访谈摘要，来源 Tech Insights Daily。第三条是相关技术应用案例分析，来源 MIT Technology Review。你想保留哪些素材？`,
      keep: `好的，已保留该素材。还有其他需要调整的吗？如果素材确认完毕，我们可以进入下一步，设置播客参数。`,
      next: `素材已确认完毕。现在让我们设置播客参数。输出语言默认中文，角色数量 2 位。请告诉我角色名称，比如主持人叫什么，嘉宾叫什么？`,
      script: `脚本已生成！总时长约 5 分钟。开场 30 秒由主持人介绍主题，正文约 3 分半围绕素材深入讨论，最后 1 分钟回顾要点。你想修改脚本还是直接继续？`,
      voice: `现在为角色选择音色。我播放几个样本供你选择。第一个是 Roger，沉稳专业的男声。第二个是 Sarah，温和清晰的女声。第三个是 George，富有磁性的男声。你觉得哪个合适？`,
      generate: `所有参数已确认！开始合成播客音频。正在处理脚本，合成语音，拼接片段。预计需要 30 秒左右完成。`,
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
  history: {
    label: "历史记录",
    title: "播客档案",
    materials: "素材",
    footer: (n: number) => `共 ${n} 条记录 — 本地存储`,
  },
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
    processing: "Thinking…",
    listening: "Listening…",
    speaking: "AI is speaking…",
    connecting: "Connecting…",
    endCall: "End Session",
    callDuration: "Duration",
    transcript: "Transcript",
    greeting: "Hi! I'm your podcast production assistant. What kind of podcast would you like to create today? Just start talking — I'm listening in real time.",
    mockVoiceInput: "I want to make a podcast about the latest advances in quantum computing",
    responses: {
      default: `Got it! Let me search for materials on quantum computing. I found 3 relevant results. First, a latest research review from Nature Science Review. Second, an industry expert interview summary from Tech Insights Daily. Third, a technology application case study from MIT Technology Review. Which materials would you like to keep?`,
      keep: `OK, material has been kept. Anything else to adjust? If materials are confirmed, we can move to the next step — setting podcast parameters.`,
      next: `Materials confirmed. Let's set podcast parameters. Output language defaults to Chinese, with 2 roles. Please tell me the role names — what should we call the host and the guest?`,
      script: `Script generated! Total duration is about 5 minutes. The opening is 30 seconds with the host introducing the topic, main content is 3.5 minutes of in-depth discussion, and the closing is 1 minute of key takeaways. Would you like to edit the script or continue?`,
      voice: `Now let's choose voices. I'll play a few samples. First is Roger — a deep, professional male voice. Second is Sarah — warm and clear female voice. Third is George — rich, magnetic male voice. Which one do you prefer?`,
      generate: `All parameters confirmed! Starting podcast synthesis. Processing script, synthesizing voices, stitching clips. Estimated time: about 30 seconds.`,
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
