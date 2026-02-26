export default {
    title: 'Linea Docs',
    description: 'Project documentation',
    themeConfig: {
        nav: [
            { text: '项目说明', link: '/' },
            { text: '曲线基类设计', link: '/math-lib-curve-base-design' },
            { text: '曲线实现方案', link: '/math-lib-curve-impl-plan' },
            { text: '曲线离散设计', link: '/math-lib-curve-discretize-design' },
            { text: '更新记录', link: '/math-lib-update' },
            { text: '异常处理', link: '/math-lib-errors' },
        ],
        sidebar: [
            {
                text: '文档',
                items: [
                    { text: '项目说明', link: '/' },
                    { text: '曲线基类设计', link: '/math-lib-curve-base-design' },
                    { text: '曲线实现方案', link: '/math-lib-curve-impl-plan' },
                    { text: '曲线离散设计', link: '/math-lib-curve-discretize-design' },
                    { text: '更新记录', link: '/math-lib-update' },
                    { text: '异常处理', link: '/math-lib-errors' },
                ],
            },
        ],
    },
}
