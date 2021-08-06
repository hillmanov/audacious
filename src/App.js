import React from 'react';
import {
  map,
  every,
  indexOf,
  sumBy,
  endsWith,
} from 'lodash';
import {
  when
} from 'mobx';
import { Observer } from 'mobx-react';
import {
  types,
  addDisposer,
  onSnapshot,
  applySnapshot,
  flow
} from 'mobx-state-tree';

import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import * as localForage from 'localforage';
import './App.css';

const {
  array,
  boolean,
  model,
  number,
  maybeNull,
  optional,
  string,
  frozen
} = types;

// Friendly aliases
const View = model;
const DataModel = model;
const ViewController = model;

const Chapter = DataModel('Chapter', {
  duration: maybeNull(number),
  tags: maybeNull(frozen()),
  file: maybeNull(frozen()),
})
.actions(self => ({
  afterCreate() {
    if (!self.ready) {
      jsmediatags.read(self.file, {
        onSuccess: ({ tags }) => {
          self.setTags(tags);
        },
        onError: (e) => {
          console.error(e);
        }
      });

      const au = document.createElement('audio');
      au.src = self.url;
      au.addEventListener('loadedmetadata', () => {
        self.setDuration(parseInt(au.duration));
      }, false);
    }
  },
  setTags(tags) {
    self.tags = tags;
  },
  setDuration(duration) {
    self.duration = duration;
  },
}))
.views(self => ({
  get title() {
    return self.tags.title || self.file.name;
  },
  get url() {
    return window.URL.createObjectURL(self.file);
  },
  get ready() {
    return !!(self.file && self.tags && self.duration);
  },
}));


const Book = DataModel('Book', {
  title: maybeNull(string),
  currentChapterIndex: optional(number, 0),
  currentChapterTime: optional(number, 0),
  chapters: array(Chapter),
})
.actions(self => ({
  afterCreate() {

  },
  setCurrentChapterIndex(currentChapterIndex) {
    self.currentChapterIndex = currentChapterIndex;
  },
  setCurrentChapterTime(currentChapterTime) {
    self.currentChapterTime = currentChapterTime;
  },
}))
.views(self => ({
  get ready() {
    return every(self.chapters, 'ready');
  },
  get totalDuration() {
    return sumBy(self.chapters, 'duration');
  },
  get currentChapter() {
    return self.chapters[self.currentChapterIndex];
  }
}));

const Controller = ViewController('Controller', {
  playbackRate: optional(number, 1),
  currentBookIndex: optional(number, -1),
  currentChapterPosition: optional(number, 0),
  books: array(Book),
})
.volatile(self => ({
  audioElement: null,
  loading: optional(boolean, false),
}))
.actions(self => ({
  afterCreate() {
    self.restore();
    addDisposer(self, onSnapshot(self, state => {
      console.log(`state.currentChapterPosition`, state.currentChapterPosition);
      localForage.setItem('state', state);
    }));
  },
  restore: flow(function* restore() {
    self.loading = true;
    const state = yield localForage.getItem('state');
    if (state) {
      applySnapshot(self, state);
      when(
        () => self.currentBook.ready,
        () => {
          self.playChapter(self.currentBook.chapters[self.currentBook.currentChapterIndex], false);
        }
      );
    }
    self.loading = false;
  }),
  setCurrentBookIndex(currentBookIndex) {
    self.currentBookIndex = currentBookIndex;
  },
  setCurrentChapterPosition(currentChapterPosition) {
    self.currentChapterPosition = currentChapterPosition;
  },
  saveBook(title, chapters) {
    const book = new Book({ title, chapters: map(chapters, chapter => new Chapter({ file: chapter}))});
    self.books.push(book);
    if (self.books.length === 1) {
      self.setCurrentBookIndex(0);
    }
  },
  setAudioElement(audioElement) {
    self.audioElement = audioElement;

    self.audioElement.addEventListener('ended', () => {
      self.playChapter(self.currentBook.currentChapterIndex + 1);
    }, false);

    self.audioElement.addEventListener('timeupdate', (update) => {
      self.setCurrentChapterPosition(self.audioElement.currentTime);
    }, false);

    self.audioElement.addEventListener('canplay', () => {
      if (self.currentChapterPosition) {
        self.audioElement.currentTime = self.currentChapterPosition;
      }
    }, { once: true });
  },
  playChapter(chapter, start = true) {
    self.currentBook.setCurrentChapterIndex(indexOf(self.currentBook.chapters, chapter));
    when(
      () => self.audioElement && chapter.ready,
      () => {
        self.audioElement.src = chapter.url;
        self.setPlaybackRate(self.playbackRate);
        window.document.title = chapter.title;
        if (start) {
          self.audioElement.play();
        }
      }
    );
  },
  setPlaybackRate(playbackRate) {
    self.playbackRate = playbackRate;
    self.audioElement.playbackRate = self.playbackRate;
  },
  adjustPlaybackRate(adjustment) {
    self.setPlaybackRate(self.playbackRate + adjustment)
    self.audioElement.playbackRate = self.playbackRate;
  }
}))
.views(self => ({
  get currentBook() {
    return self.books[self.currentBookIndex];
  },
}));

const AppView = View('App', {
  c: optional(Controller, () => Controller.create()),
})
.volatile(self => ({
  audioElementRef: React.createRef(),
}))
.actions(self => ({
  afterCreate() {

  },
  async chooseDirectory() {
    const directoryHandler = await window.showDirectoryPicker();
    const chapters = [];
    for await (const entry of directoryHandler.values()) {
      if (endsWith(entry.name, 'mp3')) {
        const fileHandle = await directoryHandler.getFileHandle(entry.name);
        const file = await fileHandle.getFile();
        chapters.push(file);
      }
    }
    self.c.saveBook(directoryHandler.name, chapters);
  }
}))
.views(self => ({
  get render() {

    return (
      <div>
      <button onClick={self.chooseDirectory}>Add Book</button>

      <Observer>{() => (
        map(self.c.books, (book, i) => (
            book.ready && (
              <div onClick={() => self.c.setCurrentBookIndex(i)}>
                Book: {book.title}
              </div>
            )
          )) || null
        )}
      </Observer>
      <Observer>{() => {
        if (!self.c.currentBook || !self.c.currentBook.ready) {
          return null;
        }
        return (
          map(self.c.currentBook.chapters, (chapter, i) => (
            <div key={chapter.title} onClick={() => self.c.playChapter(chapter)}>{self.c.currentBook.currentChapter === chapter ? '->' : '' } {chapter.title}</div>
          ))
        )
      }}
      </Observer>

        <audio
          controls
          ref={(e) => self.c.setAudioElement(e)}
        >
          <track />
        </audio>

        <Observer>{() => (
          <div>
          Playback rate: {self.c.playbackRate}
          </div> 
        )}
        </Observer>

        <button onClick={() => self.c.setPlaybackRate(2)}>2</button>
        <button onClick={() => self.c.setPlaybackRate(1.5)}>1.5</button>
        <button onClick={() => self.c.setPlaybackRate(1)}>1</button>

        <button onClick={() => self.c.adjustPlaybackRate(.1)}>+.1</button>
        <button onClick={() => self.c.adjustPlaybackRate(.01)}>+.01</button>
        <button onClick={() => self.c.adjustPlaybackRate(-.1)}>-.1</button>
        <button onClick={() => self.c.adjustPlaybackRate(-.01)}>-.01</button>
      </div>
    );
  }
}))

export default AppView;
