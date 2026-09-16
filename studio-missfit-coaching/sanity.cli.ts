import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '70j9t2re',
    dataset: 'production'
  },

  // Pinned so a deploy never prompts for it and never lands somewhere else.
  studioHost: 'missfitcoaching',
  /**
   * Enable auto-updates for studios.
   * Learn more at https://www.sanity.io/docs/cli#auto-updates
   */
  autoUpdates: true,
})
