export default {
    title: 'Linea Docs',
    description: 'Project documentation',
    themeConfig: {
        nav: [
            { text: '项目说明', link: '/' },
            { text: '数学库', link: '/math-lib' },
            { text: '更新记录', link: '/math-lib-update' },
        ],
        sidebar: [
            {
                text: '文档',
                items: [
                    { text: '项目说明', link: '/' },
                    { text: '数学库方案', link: '/math-lib' },
                    { text: '数学库更新记录', link: '/math-lib-update' },
                ],
            },
        ],
    },
}
