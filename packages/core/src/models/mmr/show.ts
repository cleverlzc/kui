/*
 * Copyright 2019 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Tab } from '../../webapp/tab'
import { MetadataBearing } from '../entity'
import { CustomSpec, isCustomSpec, showCustom } from '../../webapp/views/sidecar'
import { SidecarMode, addModeButtons } from '../../webapp/bottom-stripe'
import { isTable, isMultiTable, Table, MultiTable } from '../../webapp/models/table'
import { formatTable } from '../../webapp/views/table'

import { MultiModalResponse, Button } from './types'
import {
  Content,
  hasContent,
  ScalarResource,
  ScalarContent,
  isCommandStringContent,
  isStringWithContentType,
  isFunctionContent
} from './content-types'

type Viewable = CustomSpec | HTMLElement | Table | MultiTable

/**
 * Turn a Resource into a Viewable
 *
 */
async function format<T extends MetadataBearing>(
  tab: Tab,
  mmr: MultiModalResponse<T>,
  resource: ScalarResource | Content<T>
): Promise<Viewable> {
  if (!hasContent(resource)) {
    // then we have a plain resource. the rest of this function
    // assumes a Content structure, so wrap it up as such
    return format(tab, mmr, { content: resource })
  } else if (isFunctionContent(resource)) {
    // then resource.content is a funciton that will provide the information
    return format(tab, mmr, resource.content(tab, mmr))
  } else if (isCommandStringContent(resource)) {
    const content = await tab.REPL.qexec<ScalarResource | ScalarContent>(resource.content)
    return format(tab, mmr, content)
  } else if (isCustomSpec(resource.content)) {
    return resource.content
  } else if (isTable(resource.content) || isMultiTable(resource.content)) {
    return resource.content
  } else {
    // otherwise, we have string or HTMLElement content
    return Object.assign({ kind: mmr.kind, metadata: mmr.metadata, version: mmr.version, type: 'custom' }, resource)
  }
}

function wrapTable(tab: Tab, table: Table | MultiTable): HTMLElement {
  const dom1 = document.createElement('div')
  const dom2 = document.createElement('div')
  dom1.classList.add('scrollable', 'scrollable-auto')
  dom2.classList.add('result-as-table', 'repl-result')
  dom1.appendChild(dom2)
  formatTable(tab, table, dom2)
  return dom1
}

function formatButtons(buttons: Button[]): SidecarMode[] {
  return buttons.map(({ mode, label, command, confirm }) => ({
    mode,
    label,
    flush: 'right',
    direct: confirm ? `confirm "${command}"` : command
  }))
}

function renderContent<T extends MetadataBearing>(tab: Tab, content: string | object) {
  if (isStringWithContentType(content)) {
    return content
  } else if (isTable(content) || isMultiTable(content)) {
    return {
      content: wrapTable(tab, content)
    }
  } else {
    return {
      content
    }
  }
}

/**
 * Render a MultiModalResponse to the sidecar
 *
 */
export async function show(tab: Tab, mmr: MultiModalResponse) {
  const modes: SidecarMode[] = await Promise.all(
    mmr.modes.map(async _ => ({
      mode: _.mode,
      label: _.label || _.mode,
      direct: (tab: Tab) => {
        if (isCustomSpec(_)) {
          return _
        } else {
          return format(tab, mmr, _)
        }
      },
      defaultMode: _.defaultMode,
      leaveBottomStripeAlone: true
    }))
  )

  if (!modes.find(_ => _.defaultMode) && modes.length > 0) {
    modes[0].defaultMode = true
  }

  const modesWithButtons = mmr.buttons ? modes.concat(formatButtons(mmr.buttons)) : modes

  addModeButtons(tab, modesWithButtons, mmr)

  const defaultMode = modes.find(_ => _.defaultMode) || modes[0]

  console.error('!!!!!', modesWithButtons)
  const content = typeof defaultMode.direct === 'function' ? await defaultMode.direct(tab, mmr) : defaultMode.direct

  if (content) {
    if (isCustomSpec(content)) {
      return showCustom(tab, Object.assign({ modes: modesWithButtons }, content), { leaveBottomStripeAlone: true })
    } else {
      return showCustom(
        tab,
        Object.assign(
          {
            type: 'custom',
            kind: mmr.kind,
            metadata: mmr.metadata,
            toolbarText: mmr.toolbarText,
            version: mmr.version,
            modes: modesWithButtons
          },
          renderContent(tab, content)
        ),
        { leaveBottomStripeAlone: true }
      )
    }
  } else {
    console.error('empty content')
  }
}