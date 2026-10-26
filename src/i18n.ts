import chinese from './locales/zh-cn.json';

export type Message = keyof typeof chinese;
let language = 'en';

export function setLanguage(value: string): void {
    language = value.toLowerCase();
}

export function getLanguage(): string {
    return language.startsWith('zh') ? 'zh-CN' : 'en';
}

export function getMessages(): Readonly<Record<string, string>> {
    return getLanguage() === 'zh-CN' ? chinese : {};
}

export function t(message: Message, ...args: Array<string | number>): string {
    const text = getLanguage() === 'zh-CN' ? chinese[message] : message;
    return text.replace(/\{(\d+)\}/g, (match, index: string) => {
        const value = args[Number(index)];
        return value === undefined ? match : String(value);
    });
}

export function countMessage(singular: Message, plural: Message, count: number): string {
    const locale = getLanguage();
    const message = new Intl.PluralRules(locale).select(count) === 'one' ? singular : plural;
    return t(message, new Intl.NumberFormat(locale).format(count));
}
