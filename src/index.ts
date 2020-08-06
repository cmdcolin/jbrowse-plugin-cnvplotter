import AdapterType from "@gmod/jbrowse-core/pluggableElementTypes/AdapterType";
import Plugin from "@gmod/jbrowse-core/Plugin";
import PluginManager from '@gmod/jbrowse-core/PluginManager'
import {
  ConfigurationSchema,
  readConfObject,
} from "@gmod/jbrowse-core/configuration";
import { ObservableCreate } from "@gmod/jbrowse-core/util/rxjs";
import { BaseFeatureDataAdapter } from "@gmod/jbrowse-core/data_adapters/BaseAdapter";
import { Feature } from '@gmod/jbrowse-core/util/simpleFeature'
import { TabixIndexedFile } from '@gmod/tabix'
import { openLocation } from '@gmod/jbrowse-core/util/io'

const configSchema = ConfigurationSchema(
  "VCFRawAdapter",
  {
    subadapter: {
      type: "frozen",
      description: "subadapter",
      defaultValue: {},
    },
  },
  { explicitlyTyped: true }
);

class VCFRawTabix extends BaseFeatureDataAdapter {
  protected subadapter: any

  public constructor(config: unknown, getSubAdapter: Function) {
    super(config)
    const subadapter = readConfObject(config,'subadapter')
    console.log(subadapter)
    this.subadapter = getSubAdapter(subadapter).dataAdapter

  }

  public async getRefNames(opts: BaseOptions = {}) {
    return this.subadapter.getRefNames(opts)
  }

  public getFeatures(query:any, opts: any) {
    return ObservableCreate<Feature>(async observer => {
      const parser = await this.subadapter.parser
      await this.subadapter.vcf.getLines(query.refName, query.start, query.end, {
        lineCallback: (line: string, fileOffset: number) => {
          console.log('here',line)

        },
        signal: opts.signal,
      })
      observer.complete()
    }, opts.signal)
  }
}

export default class VCFRawAdapter extends Plugin {
  name = "VCFRawAdapter";
  install(pluginManager: PluginManager) {
    pluginManager.addAdapterType(
      () =>
        new AdapterType({
          name: "VCFRawAdapter",
          configSchema,
          AdapterClass: VCFRawTabix,
        })
    );
  }
}
