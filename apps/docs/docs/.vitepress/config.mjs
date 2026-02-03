export default {
    title: 'Linea Docs',
    description: 'Project documentation',
    themeConfig: {
        nav: [
            { text: '指南', link: '/guide' },
            { text: 'API', link: '/api' },
        ],
        sidebar: [
            { text: '开始', items: [{ text: '指南', link: '/guide' }] },
            { text: '参考', items: [{ text: 'API', link: '/api' }] },
        ],
    },
}
