export interface CollectionCard {
  id: string;
  title: string;
  description: string;
  image: string;
  unlocked: boolean;
}

export const CARDS: CollectionCard[] = [
  {
    id: 'pretzel',
    title: 'Brezel',
    description: 'A type of baked bread product made from dough that is commonly shaped into a knot.',
    image: 'https://picsum.photos/seed/pretzel/400/400',
    unlocked: false
  },
  {
    id: 'castle',
    title: 'Neuschwanstein',
    description: 'The 19th-century Romanesque Revival palace on a rugged hill above the village of Hohenschwangau.',
    image: 'https://picsum.photos/seed/castle/400/400',
    unlocked: false
  },
  {
    id: 'currywurst',
    title: 'Currywurst',
    description: 'A fast food dish of German origin consisting of steamed, then fried pork sausage.',
    image: 'https://picsum.photos/seed/sausage/400/400',
    unlocked: false
  },
  {
    id: 'brandenburg',
    title: 'Brandenburger Tor',
    description: 'An 18th-century neoclassical monument in Berlin, built on the orders of Prussian king Frederick William II.',
    image: 'https://picsum.photos/seed/berlin/400/400',
    unlocked: false
  },
  {
    id: 'oktoberfest',
    title: 'Oktoberfest',
    description: 'The world\'s largest Volksfest, held annually in Munich, Bavaria, Germany.',
    image: 'https://picsum.photos/seed/beer/400/400',
    unlocked: false
  },
  {
    id: 'autobahn',
    title: 'Autobahn',
    description: 'The federal controlled-access highway system in Germany.',
    image: 'https://picsum.photos/seed/highway/400/400',
    unlocked: false
  }
];
