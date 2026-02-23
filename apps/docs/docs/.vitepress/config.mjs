export default {
    title: 'Linea Docs',
    description: 'Project documentation',
    themeConfig: {
        nav: [
            { text: '项目说明', link: '/' },
            { text: '曲线设计', link: '/math-lib-curve-design' },
            { text: '更新记录', link: '/math-lib-update' },
        ],
        sidebar: [
            {
                text: '文档',
                items: [
                    { text: '项目说明', link: '/' },
                    { text: '曲线设计文档', link: '/math-lib-curve-design' },
                    { text: '数学库更新记录', link: '/math-lib-update' },
                ],
            },
        ],
    },
}
