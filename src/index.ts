import AdapterType from '@gmod/jbrowse-core/pluggableElementTypes/AdapterType'
import Plugin from '@gmod/jbrowse-core/Plugin'
import PluginManager from '@gmod/jbrowse-core/PluginManager'
import {
  ConfigurationSchema,
  readConfObject,
} from '@gmod/jbrowse-core/configuration'
import { ObservableCreate } from '@gmod/jbrowse-core/util/rxjs'
import { BaseFeatureDataAdapter } from '@gmod/jbrowse-core/data_adapters/BaseAdapter'
import SimpleFeature, { Feature } from '@gmod/jbrowse-core/util/simpleFeature'
import { openLocation } from '@gmod/jbrowse-core/util/io'
import AbortablePromiseCache from 'abortable-promise-cache'
import QuickLRU from 'quick-lru'

const configSchema = ConfigurationSchema(
  'VCFRawAdapter',
  {
    subadapter: {
      type: 'frozen',
      description: 'subadapter',
      defaultValue: {},
    },
  },
  { explicitlyTyped: true },
)

class VCFRawTabix extends BaseFeatureDataAdapter {
  protected subadapter: any
  protected featureCache: any

  public constructor(config: unknown, getSubAdapter: Function) {
    super(config)
    const subadapter = readConfObject(config, 'subadapter')
    this.subadapter = getSubAdapter(subadapter).dataAdapter
    this.featureCache = new AbortablePromiseCache({
      cache: new QuickLRU({
        maxSize: 20,
      }),
      fill: this._readChunk.bind(this),
    })
  }
  async _readChunk(query) {
    const parser = await this.subadapter.parser
    const samples = parser.samples

    const end = 70000000
    let binSize = 100000
    var bins = []
    for (let i = 0; i < end; i += binSize) {
      bins.push({
        samples: samples.map(() => ({ score: 0, count: 0 })),
      })
    }

    await this.subadapter.vcf.getLines(
      query.refName,
      0,
      undefined,
      (line, fileOffset) => {
        const fields = line.split('\t')
        const start = +fields[1]
        const featureBin = Math.max(Math.floor(start / binSize), 0)
        bins[featureBin].start = featureBin * binSize
        bins[featureBin].end = (featureBin + 1) * binSize
        bins[featureBin].id = fileOffset
        for (let i = 0; i < samples.length; i++) {
          const sampleName = samples[i]
          const score = +fields[9 + i].split(':')[2]
          bins[featureBin].samples[i].score += isNaN(score) ? 0 : score
          bins[featureBin].samples[i].count++
          bins[featureBin].samples[i].source = sampleName
        }
      },
    )
    let averages = new Array(samples.length)
    averages.fill(0)
    bins.forEach(bin => {
      bin.samples.forEach((sample, index) => {
        sample.score = sample.score / (sample.count || 1)
        averages[index] += sample.score
      })
    })

    return {
      averages: averages.map(average => average / bins.length),
      bins,
    }
  }
  public async getRefNames(opts: BaseOptions = {}) {
    return this.subadapter.getRefNames(opts)
  }


  public getFeatures(query: any, opts: any) {
    return ObservableCreate<Feature>(async observer => {
      const { averages, bins } = await this.featureCache.get(query.ref, query)
      bins.forEach(feature => {
        if (feature.end > query.start && feature.start < query.end) {
          const sample = feature.samples[0]
          observer.next(
            new SimpleFeature({
              ...feature,
              ...sample,
              id: 'feat-'+feature.id,
              uniqueId: 'feat-'+feature.id,
              refName: query.refName,
            }),
          )
        }
      })
      observer.complete()
    }, opts.signal)
  }
  freeResources() {}
}

export default class VCFRawAdapter extends Plugin {
  name = 'VCFRawAdapter'
  install(pluginManager: PluginManager) {
    pluginManager.addAdapterType(
      () =>
        new AdapterType({
          name: 'VCFRawAdapter',
          configSchema,
          AdapterClass: VCFRawTabix,
        }),
    )
  }
}
